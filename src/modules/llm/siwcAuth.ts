/**
 * Sign in with ChatGPT（SIWC）— ChatGPT 订阅接入的 OAuth 核心
 *
 * 依据 developers.openai.com/siwc 文档（2026-10-28 实拉，详见工作区 docs/vendors.md OpenAI 节）：
 * - 官方面向「开源 + 本地托管应用」的通道：动态注册 client（dynamic_agent_client → issued client_id）
 * - OAuth 2.0 + PKCE S256；回调必须 HTTP loopback（127.0.0.1，仅端口可变，禁用 localhost）
 * - ID token 须 JWKS 验签（iss / aud / exp / nonce）
 * - ChatGPT plan usage 须检查 granted scopes 含 chatgpt.tokens.use.direct
 * - 凭据与现有 API Key 实践一致存 prefs（敏感信息永不入库、永不打日志）
 */

import { config } from "../../../package.json";
import { zhttp } from "./provider";

const ISSUER = "https://auth.openai.com";
const AUTHORIZE_URL = `${ISSUER}/api/accounts/authorize`;
const TOKEN_URL = `${ISSUER}/api/accounts/oauth/token`;
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`;
const RESOURCE = "https://api.openai.com/v1";
const SIWC_SCOPES =
  "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const DYNAMIC_CLIENT_ID = "dynamic_agent_client";
const PLAN_SCOPE = "chatgpt.tokens.use.direct";
const AGENT_NAME_HINT = "PaperWorm";

export const AUTH_CALLBACK_PATH = "/paperworm/auth-callback";

/** 订阅额度用尽/不可用（SIWC 专属错误码，UI 据此显示 Manage usage 引导） */
export class SiwcUsageLimitError extends Error {
  constructor(
    public code:
      | "subscription_sharing_usage_limit_exceeded"
      | "subscription_sharing_usage_unavailable"
      | string,
  ) {
    super(`ChatGPT 订阅额度受限（${code}）`);
  }
}

/** 登录已过期，需用户到设置页重新登录 */
export class ReauthRequiredError extends Error {
  constructor(msg = "ChatGPT 登录已过期，请在 PaperWorm 设置中重新登录") {
    super(msg);
  }
}

const pref = (key: string) => `${config.prefsPrefix}.${key}`;
const K = {
  clientId: "llm.openai-siwc.clientId",
  email: "llm.openai-siwc.email",
  subject: "llm.openai-siwc.subject",
  hostId: "llm.openai-siwc.hostId",
  idToken: "llm.openai-siwc.idToken",
  accessToken: "llm.openai-siwc.accessToken",
  refreshToken: "llm.openai-siwc.refreshToken",
  expiresAt: "llm.openai-siwc.expiresAt",
  scopes: "llm.openai-siwc.scopes",
  welcomed: "llm.openai-siwc.welcomed",
  reauth: "llm.openai-siwc.reauth",
  debug: "llm.openai-siwc.debugCallback",
};
const getPref = (k: string): string =>
  (Zotero.Prefs.get(pref(k), true) as string) ?? "";
const setPref = (k: string, v: string) => Zotero.Prefs.set(pref(k), v, true);
const clearPref = (k: string) => Zotero.Prefs.clear(pref(k), true);

// ── 编码/随机工具 ─────────────────────────────────────────────────────────────

function randomBase64Url(byteLen: number): string {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToStr(b64: string): string {
  const b = b64.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b.length % 4 ? "=".repeat(4 - (b.length % 4)) : "";
  return atob(b + pad);
}

async function sha256Base64Url(str: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(str),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

/** 生成持久化 host ID（SIWC 推荐 urn:uuid: 形态，UUIDv4） */
function ensureHostId(): string {
  const existing = getPref(K.hostId);
  if (existing) return existing;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const hostId = `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  setPref(K.hostId, hostId);
  return hostId;
}

// ── JWKS 验签 ────────────────────────────────────────────────────────────────

let jwksCache: { keys: any[]; fetchedAt: number } | null = null;

async function fetchJwks(): Promise<any[]> {
  const resp = await zhttp("GET", JWKS_URL, {
    successCodes: [200],
    timeout: 15000,
  });
  const data = JSON.parse(resp.responseText) as { keys: any[] };
  jwksCache = { keys: data.keys ?? [], fetchedAt: Date.now() };
  return jwksCache.keys;
}

/**
 * 验证 OpenAI ID token：RS256 签名（WebCrypto）+ iss / aud / exp / nonce。
 * 依据 SIWC website 页验签示例（Gecko 环境无 jose 库，手写等价实现）。
 */
async function verifyIdToken(
  idToken: string,
  expectedNonce: string,
  audience: string,
): Promise<any> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("ID token 格式无效");
  const [h64, p64, s64] = parts;
  const header = JSON.parse(base64UrlToStr(h64));
  const payload = JSON.parse(base64UrlToStr(p64));

  if (payload.iss !== ISSUER) throw new Error("ID token 签发者不符");
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(audience)) throw new Error("ID token 受众不符");
  if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now() - 5000)
    throw new Error("ID token 已过期");
  if (payload.nonce !== expectedNonce) throw new Error("ID token nonce 不匹配");

  const keys =
    jwksCache && Date.now() - jwksCache.fetchedAt < 3600_000
      ? jwksCache.keys
      : await fetchJwks();
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    // 未知 kid：刷新 JWKS（密钥轮换）
    jwk = (await fetchJwks()).find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new Error("JWKS 中未找到签名密钥");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const sigBin = atob(s64.replace(/-/g, "+").replace(/_/g, "/"));
  const sig = new Uint8Array(sigBin.length);
  for (let i = 0; i < sigBin.length; i++) sig[i] = sigBin.charCodeAt(i);
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    sig as unknown as ArrayBuffer,
    new TextEncoder().encode(`${h64}.${p64}`),
  );
  if (!ok) throw new Error("ID token 签名验证失败");
  return payload;
}

// ── 待处理的授权事务（内存态：进程重启即失效，等价于取消授权） ────────────────

interface PendingAuth {
  state: string;
  verifier: string;
  nonce: string;
  redirectUri: string;
  clientId: string; // 首次为 dynamic_agent_client，返回登录为 issued id
}
let pending: PendingAuth | null = null;

// ── 公开 API ─────────────────────────────────────────────────────────────────

export const SiwcAuth = {
  /** loopback 回调地址（scheme/host/path 固定、端口可变——SIWC 合规） */
  redirectUri(): string {
    const port = authServerPort || startAuthListener();
    return `http://127.0.0.1:${port}${AUTH_CALLBACK_PATH}`;
  },

  /** 停止本地回调监听（手动粘贴完成 / 取消登录后调用） */
  stopListener(): void {
    stopAuthListener();
  },

  isSignedIn(): boolean {
    return !!getPref(K.refreshToken) || !!getPref(K.accessToken);
  },

  getAccountInfo(): { email: string; subject: string } {
    return { email: getPref(K.email), subject: getPref(K.subject) };
  },

  /** 首次登录确认弹窗是否已展示过（官方 UI 规范：仅首次） */
  isWelcomed(): boolean {
    return getPref(K.welcomed) === "true";
  },
  markWelcomed(): void {
    setPref(K.welcomed, "true");
  },

  /**
   * 发起登录：生成 state/nonce/PKCE 并返回授权 URL（调用方负责打开系统浏览器）。
   * 首次登录走动态注册（dynamic_agent_client + agent_name_hint + host ID），
   * 后续复用已签发的 client_id 并附 id_token_hint 加速。
   */
  async beginSignIn(): Promise<string> {
    const state = randomBase64Url(32);
    const verifier = randomBase64Url(64);
    const challenge = await sha256Base64Url(verifier);
    const nonce = randomBase64Url(32);
    const redirectUri = this.redirectUri();
    const savedClientId = getPref(K.clientId);
    const clientId = savedClientId || DYNAMIC_CLIENT_ID;
    pending = { state, verifier, nonce, redirectUri, clientId };

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SIWC_SCOPES,
      resource: RESOURCE,
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    if (!savedClientId) {
      params.set("agent_name_hint", AGENT_NAME_HINT);
      params.set("ext_agent_host_id", ensureHostId());
    } else {
      const idToken = getPref(K.idToken);
      if (idToken) params.set("id_token_hint", idToken);
    }
    return `${AUTHORIZE_URL}?${params.toString()}`;
  },

  /** 取消进行中的授权（设置页"取消"按钮 / 超时）：同时关闭回调监听 */
  cancelSignIn(): void {
    pending = null;
    stopAuthListener();
  },

  /** 是否有进行中的授权 */
  hasPendingAuth(): boolean {
    return pending !== null;
  },

  /**
   * 处理回调（由 Zotero.Server 端点调用）：
   * state 校验 → code 交换 → ID token 验签 → plan scope 检查 → 凭据落 prefs。
   */
  async handleCallback(
    searchParams: URLSearchParams,
  ): Promise<{ email: string }> {
    if (!pending) throw new Error("没有进行中的登录请求");
    const tx = pending;

    if (searchParams.get("error")) {
      pending = null;
      throw new Error(
        searchParams.get("error") === "access_denied"
          ? "你拒绝了 PaperWorm 的授权请求"
          : `授权失败：${searchParams.get("error")}`,
      );
    }
    const returnedState = searchParams.get("state");
    if (!returnedState || returnedState !== tx.state) {
      pending = null;
      throw new Error("授权状态校验失败（state 不匹配），请重新发起登录");
    }
    const code = searchParams.get("code");
    if (!code) {
      pending = null;
      throw new Error("回调中缺少授权码");
    }
    // 动态注册：回调带回 issued client_id；复登回调可能省略（沿用 pending 的）
    const callbackClientId = searchParams.get("client_id");
    const clientId =
      tx.clientId === DYNAMIC_CLIENT_ID
        ? callbackClientId
        : callbackClientId && callbackClientId !== tx.clientId
          ? (() => {
              // SIWC 规定：回调 client_id 与已注册不符 → 拒绝而非替换
              pending = null;
              throw new Error("回调的 client_id 与已注册的不一致，已拒绝");
            })()
          : tx.clientId;
    if (!clientId) {
      pending = null;
      throw new Error("动态注册未完成（回调缺少 client_id），请重试");
    }

    // code 交换（public client，无 secret）
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: tx.redirectUri,
      client_id: clientId,
      code_verifier: tx.verifier,
      resource: RESOURCE,
    });
    let tokens: any;
    try {
      const resp = await zhttp("POST", TOKEN_URL, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        successCodes: [200],
        timeout: 15000,
      });
      tokens = JSON.parse(resp.responseText);
    } catch (e) {
      pending = null;
      throw new Error(`授权码交换失败：${(e as Error).message}`);
    }
    if (typeof tokens.id_token !== "string") {
      pending = null;
      throw new Error("token 响应中缺少 ID token");
    }

    // ID token 验签 + plan 权限检查
    const payload = await verifyIdToken(tokens.id_token, tx.nonce, clientId);
    const granted: string = tokens.scope ?? "";
    if (!granted.split(/\s+/).includes(PLAN_SCOPE)) {
      pending = null;
      throw new Error(
        "用户未授权使用 ChatGPT 订阅额度（chatgpt.tokens.use.direct），请在登录时勾选允许",
      );
    }

    // 凭据落 prefs（与 API key 存储实践一致；敏感值永不入库、永不打日志）
    setPref(K.clientId, clientId);
    setPref(K.email, typeof payload.email === "string" ? payload.email : "");
    setPref(K.subject, typeof payload.sub === "string" ? payload.sub : "");
    setPref(K.idToken, tokens.id_token);
    setPref(K.accessToken, tokens.access_token ?? "");
    setPref(K.refreshToken, tokens.refresh_token ?? "");
    setPref(
      K.expiresAt,
      String(Date.now() + (tokens.expires_in ?? 3600) * 1000 - 60_000),
    );
    setPref(K.scopes, granted);
    try {
      clearPref(K.reauth);
    } catch {
      /* 不存在时忽略 */
    }
    pending = null;
    return { email: payload.email ?? "" };
  },

  /**
   * 取得可用 access token：未过期直接返回；过期用 refresh token 静默续期
   * （SIWC 为轮换 refresh token，续期后整体替换）。失败抛 ReauthRequiredError。
   */
  async getValidAccessToken(): Promise<string> {
    const accessToken = getPref(K.accessToken);
    const expiresAt = parseInt(getPref(K.expiresAt) || "0", 10);
    if (accessToken && expiresAt > Date.now()) return accessToken;

    const refreshToken = getPref(K.refreshToken);
    const clientId = getPref(K.clientId);
    if (!refreshToken || !clientId) throw new ReauthRequiredError();

    try {
      const resp = await zhttp("POST", TOKEN_URL, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: clientId,
          resource: RESOURCE,
        }).toString(),
        successCodes: [200],
        timeout: 15000,
      });
      const tokens = JSON.parse(resp.responseText);
      setPref(K.accessToken, tokens.access_token ?? "");
      if (tokens.refresh_token) setPref(K.refreshToken, tokens.refresh_token);
      setPref(
        K.expiresAt,
        String(Date.now() + (tokens.expires_in ?? 3600) * 1000 - 60_000),
      );
      try {
        clearPref(K.reauth); // 刷新成功：清除"需重新登录"标记
      } catch {
        /* ignore */
      }
      return tokens.access_token as string;
    } catch {
      // 标记需重登：设置页态④横幅与面板错误提示的数据源
      try {
        setPref(K.reauth, "true");
      } catch {
        /* ignore */
      }
      throw new ReauthRequiredError();
    }
  },

  /** 是否需要重新登录（refresh 已失效） */
  isReauthNeeded(): boolean {
    return getPref(K.reauth) === "true" && this.isSignedIn();
  },

  /** 断开连接：清空全部凭据（保留 hostId——同一主机的稳定标识） */
  signOut(): void {
    pending = null;
    for (const k of [
      K.clientId,
      K.email,
      K.subject,
      K.idToken,
      K.accessToken,
      K.refreshToken,
      K.expiresAt,
      K.scopes,
      K.welcomed,
      K.reauth,
    ]) {
      try {
        clearPref(k);
      } catch {
        /* pref 不存在时忽略 */
      }
    }
  },
};

// ── 独立 loopback 监听器（OAuth 回调）────────────────────────────────────────
// 不使用 Zotero.Server：部分环境中它不对插件注册的端点派发/响应（浏览器访问
// 插件端点得到空响应，而内置 connector 端点正常）。改为插件自行监听
// 127.0.0.1 专用端口——SIWC 协议明确允许回调端口可变（同一授权事务内一致即可）。

const AUTH_PORTS = [23120, 23121, 23122, 23123, 23124, 23125];

let authServer: any = null;
let authServerPort = 0;

function startAuthListener(): number {
  if (authServer) return authServerPort;
  for (const port of AUTH_PORTS) {
    try {
      const server = (Components as any).classes[
        "@mozilla.org/network/server-socket;1"
      ].createInstance((Components as any).interfaces.nsIServerSocket);
      server.init(port, true, -1); // 仅绑定 loopback
      server.asyncListen({
        onSocketAccepted: (_sock: any, transport: any) =>
          handleAuthConnection(transport),
        onStopListening: () => {},
      });
      authServer = server;
      authServerPort = port;
      Zotero.debug(
        `[PaperWorm] SIWC callback listener on 127.0.0.1:${port}`,
        1,
      );
      return port;
    } catch {
      // 端口占用：尝试下一个
    }
  }
  throw new Error("无法启动本地授权回调端口（23120–23125 均被占用）");
}

function stopAuthListener(): void {
  if (authServer) {
    try {
      authServer.close();
    } catch {
      /* ignore */
    }
  }
  authServer = null;
  authServerPort = 0;
}

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function writeHttpResponse(
  output: any,
  status: number,
  bodyHtml: string,
): void {
  const statusText: Record<number, string> = {
    200: "OK",
    400: "Bad Request",
    404: "Not Found",
    500: "Internal Server Error",
  };
  const body =
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>PaperWorm</title></head>` +
    `<body style="font-family:system-ui;padding:48px;text-align:center;color:${
      status === 200 ? "#333" : "#c0392b"
    }">${bodyHtml}</body></html>`;
  const head =
    `HTTP/1.1 ${status} ${statusText[status] ?? "OK"}\r\n` +
    "Content-Type: text/html; charset=utf-8\r\n" +
    `Content-Length: ${new TextEncoder().encode(body).length}\r\n` +
    "Connection: close\r\n\r\n";
  const binOut = (Components as any).classes[
    "@mozilla.org/binaryoutputstream;1"
  ].createInstance((Components as any).interfaces.nsIBinaryOutputStream);
  binOut.setOutputStream(output);
  const headBytes = new TextEncoder().encode(head);
  const bodyBytes = new TextEncoder().encode(body);
  binOut.writeByteArray([...headBytes], headBytes.length);
  binOut.writeByteArray([...bodyBytes], bodyBytes.length);
  binOut.flush();
}

function handleAuthConnection(transport: any): void {
  let input: any;
  let output: any;
  try {
    input = transport.openInputStream(0, 0, 0);
    output = transport.openOutputStream(0, 0, 0);
  } catch {
    try {
      transport.close(0);
    } catch {
      /* ignore */
    }
    return;
  }
  const binIn = (Components as any).classes[
    "@mozilla.org/binaryinputstream;1"
  ].createInstance((Components as any).interfaces.nsIBinaryInputStream);
  binIn.setInputStream(input);
  let raw = "";

  const finish = () => {
    try {
      output.close();
    } catch {
      /* ignore */
    }
    try {
      transport.close(0);
    } catch {
      /* ignore */
    }
  };

  const onData = {
    onInputStreamReady: (stream: any) => {
      try {
        const avail = stream.available();
        if (avail > 0) raw += binIn.readBytes(avail);
        if (!raw.includes("\r\n\r\n") && raw.length <= 65536) {
          stream.asyncWait(onData, 0, 0, null);
          return;
        }
        const firstLine = raw.split("\r\n")[0] ?? "";
        const m = /^GET\s+(\S+)\s+HTTP\//.exec(firstLine);
        if (!m) {
          writeHttpResponse(output, 400, "<h2>Bad Request</h2>");
          finish();
          return;
        }
        // target 可能是路径或绝对 URL（代理场景）
        let target = m[1];
        if (/^https?:\/\//i.test(target)) {
          try {
            const u = new URL(target);
            target = u.pathname + u.search;
          } catch {
            /* 保持原样 */
          }
        }
        const q = target.indexOf("?");
        const pathname = q >= 0 ? target.slice(0, q) : target;
        const params = new URLSearchParams(q >= 0 ? target.slice(q + 1) : "");
        if (pathname !== AUTH_CALLBACK_PATH) {
          writeHttpResponse(output, 404, "<h2>Not Found</h2>");
          finish();
          return;
        }
        void (async () => {
          let status = 400;
          let body = "";
          try {
            const { email } = await SiwcAuth.handleCallback(params);
            status = 200;
            body =
              `<h2>✓ 授权成功</h2><p>已登录 ChatGPT 账号 <b>${escapeHtml(email)}</b></p>` +
              "<p>请回到 Zotero 继续使用 PaperWorm，本页面可关闭。</p>";
          } catch (e) {
            const msg =
              e instanceof Error ? e.message : String((e as any)?.message ?? e);
            Zotero.debug(`[PaperWorm] SIWC callback error: ${msg}`, 1);
            body =
              `<h2>✗ 授权失败</h2><p>${escapeHtml(msg)}</p>` +
              "<p>请回到 Zotero 的 PaperWorm 设置重试。</p>";
          }
          try {
            writeHttpResponse(output, status, body);
          } catch {
            /* ignore */
          }
          finish();
          // 回调已完成：稍后关闭监听器（确保响应数据写出）。
          // 仅当仍是同一个 server 才关闭——避免用户在 1.5s 内重新发起登录时
          // 把新会话的监听器误关（竞态）。
          const serverAtResponse = authServer;
          setTimeout(() => {
            if (authServer === serverAtResponse) stopAuthListener();
          }, 1500);
        })();
      } catch {
        try {
          writeHttpResponse(output, 500, "<h2>Internal Error</h2>");
        } catch {
          /* ignore */
        }
        finish();
      }
    },
  };
  try {
    input.asyncWait(onData, 0, 0, null);
  } catch {
    finish();
  }
}
