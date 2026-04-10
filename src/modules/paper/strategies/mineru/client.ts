// MinerU API 客户端 - 精准解析模式
// 使用 XMLHttpRequest 进行网络请求，支持流式上传和取消
// 注意：Zotero chrome 特权上下文中 AbortController 不可用，使用 boolean 标志 + XHR 引用实现取消

import { MinerUConfig, UploadUrlResponse, TaskStatusResponse } from "./types";

const DEFAULT_BASE_URL = "https://mineru.net";
const POLL_INTERVAL = 3000; // 3秒轮询一次
const MAX_POLL_TIME = 600000; // 10分钟超时（VLM 模式 + 排队等待可能需要较长时间）

export class MinerUClient {
  private config: MinerUConfig;
  private aborted = false;
  private activeXhrs: XMLHttpRequest[] = [];
  private pollTimer: number | null = null;

  constructor(config: MinerUConfig) {
    this.config = {
      baseUrl: DEFAULT_BASE_URL,
      enableTable: true,
      enableFormula: true,
      language: "ch",
      ...config,
    };
  }

  /**
   * 提取 PDF 全文
   * 流程：1. 申请上传 URL → 2. PUT 上传 → 3. 轮询状态 → 4. 下载 ZIP → 5. 返回 ZIP 路径
   *
   * @param onProgress - 进度回调函数 (stage: string, current: number, total: number)
   * @returns ZIP 文件的本地路径
   */
  async extractPDF(
    filePath: string,
    signal?: { addEventListener: (type: string, handler: () => void) => void },
    onProgress?: (stage: string, current: number, total: number) => void
  ): Promise<string> {
    this.aborted = false;
    this.activeXhrs = [];

    // 如果有外部 signal，监听它
    if (signal) {
      signal.addEventListener("abort", () => {
        this.abort();
      });
    }

    try {
      onProgress?.("uploading", 0, 100);

      // 1. 申请上传 URL
      const { batchId, uploadUrl } = await this.requestUploadUrl(filePath);

      // 检查是否已取消
      if (this.aborted) {
        throw new Error("提取已取消");
      }

      onProgress?.("uploading", 30, 100);

      // 2. PUT 上传文件
      await this.uploadFile(filePath, uploadUrl);

      onProgress?.("uploading", 50, 100);

      // 检查是否已取消
      if (this.aborted) {
        throw new Error("提取已取消");
      }

      onProgress?.("processing", 50, 100);

      // 3. 轮询等待完成，获取 ZIP 下载链接
      const zipUrl = await this.pollForResult(batchId, filePath, onProgress);

      // 检查是否已取消
      if (this.aborted) {
        throw new Error("提取已取消");
      }

      onProgress?.("downloading", 90, 100);

      // 4. 下载 ZIP 到临时目录，返回文件路径
      const zipPath = await this.downloadZipToFile(zipUrl);

      onProgress?.("completed", 100, 100);

      return zipPath;
    } finally {
      this.cleanup();
    }
  }

  /**
   * 申请批量上传 URL
   */
  private async requestUploadUrl(filePath: string): Promise<{ batchId: string; uploadUrl: string }> {
    const fileName = filePath.split("/").pop() || filePath.split("\\").pop() || "document.pdf";

    const data = {
      files: [{
        name: fileName,
        is_ocr: false,
      }],
      model_version: "vlm",
      enable_table: this.config.enableTable,
      enable_formula: this.config.enableFormula,
      language: this.config.language,
    };

    const response = await this.httpRequest<UploadUrlResponse>(
      "/api/v4/file-urls/batch",
      "POST",
      JSON.stringify(data),
      {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.apiToken}`,
      }
    );

    if (response.code !== 0) {
      throw new Error(`申请上传 URL 失败: ${response.msg}`);
    }

    return {
      batchId: response.data.batch_id,
      uploadUrl: response.data.file_urls[0],
    };
  }

  /**
   * PUT 上传文件到 OSS
   */
  private async uploadFile(filePath: string, uploadUrl: string): Promise<void> {
    // 读取文件为二进制
    const fileData = await IOUtils.read(filePath);

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      this.activeXhrs.push(xhr);

      xhr.open("PUT", uploadUrl, true);
      // 注意：OSS 预签名 URL 上传时不得设置 Content-Type，
      // 否则与签名不匹配导致 403（API 文档明确说明）

      xhr.onload = () => {
        this.removeXhr(xhr);
        if (xhr.status === 200 || xhr.status === 201) {
          resolve();
        } else {
          reject(new Error(`上传失败: HTTP ${xhr.status}`));
        }
      };

      xhr.onerror = () => { this.removeXhr(xhr); reject(new Error("上传网络错误")); };
      xhr.onabort = () => { this.removeXhr(xhr); reject(new Error("上传已取消")); };

      xhr.send(fileData);
    });

    ztoolkit.log("文件上传成功");
  }

  /**
   * 轮询等待解析完成
   */
  private async pollForResult(
    batchId: string,
    filePath: string,
    onProgress?: (stage: string, current: number, total: number) => void
  ): Promise<string> {
    const startTime = Date.now();
    const fileName = filePath.split("/").pop() || filePath.split("\\").pop() || "document.pdf";

    return new Promise((resolve, reject) => {
      const poll = async () => {
        // 检查是否已取消
        if (this.aborted) {
          reject(new Error("提取已取消"));
          return;
        }

        // 检查是否超时
        if (Date.now() - startTime > MAX_POLL_TIME) {
          reject(new Error("解析超时（超过5分钟）"));
          return;
        }

        try {
          const response = await this.httpRequest<TaskStatusResponse>(
            `/api/v4/extract-results/batch/${batchId}`,
            "GET",
            null,
            {
              "Authorization": `Bearer ${this.config.apiToken}`,
            }
          );

          if (response.code !== 0) {
            reject(new Error(`查询状态失败: ${response.msg}`));
            return;
          }

          const result = response.data.extract_result.find(
            r => r.file_name === fileName
          );

          if (!result) {
            reject(new Error("找不到解析结果"));
            return;
          }

          // 处理不同状态
          switch (result.state) {
            case "done":
              if (result.full_zip_url) {
                ztoolkit.log("MinerU 解析完成");
                resolve(result.full_zip_url);
              } else {
                reject(new Error("解析完成但没有 ZIP 链接"));
              }
              return;

            case "failed":
              reject(new Error(`解析失败: ${result.err_msg || "未知错误"}`));
              return;

            case "waiting-file":
            case "pending": {
              // 排队等待服务器资源
              onProgress?.("waiting", 50, 100);
              ztoolkit.log(`MinerU 排队中: ${result.state}`);
              this.pollTimer = setTimeout(poll, POLL_INTERVAL) as unknown as number;
              break;
            }

            case "running":
            case "converting": {
              // 正在处理
              const progress = result.extract_progress;
              if (progress && progress.total_pages > 0) {
                const percent = Math.round((progress.extracted_pages / progress.total_pages) * 40) + 50;
                onProgress?.("processing", percent, 100);
                ztoolkit.log(`解析进度: ${progress.extracted_pages}/${progress.total_pages} 页`);
              } else {
                onProgress?.("processing", 55, 100);
              }
              this.pollTimer = setTimeout(poll, POLL_INTERVAL) as unknown as number;
              break;
            }

            default:
              reject(new Error(`未知状态: ${result.state}`));
          }
        } catch (error) {
          reject(error);
        }
      };

      // 开始第一次轮询
      poll();
    });
  }

  /**
   * 下载 ZIP 到临时文件
   *
   * @returns ZIP 文件的本地路径
   */
  private async downloadZipToFile(zipUrl: string): Promise<string> {
    // 下载 ZIP 文件
    const zipData = await this.downloadFile(zipUrl);

    // 保存到临时目录
    const tempDir = Zotero.getTempDirectory();
    const tempZipPath = tempDir.clone();
    tempZipPath.append(`mineru_${Date.now()}.zip`);

    await IOUtils.write(tempZipPath.path, zipData);

    ztoolkit.log(`ZIP 已下载到: ${tempZipPath.path}`);
    return tempZipPath.path;
  }

  /**
   * 下载文件
   */
  private async downloadFile(url: string): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      this.activeXhrs.push(xhr);

      xhr.open("GET", url, true);
      xhr.responseType = "arraybuffer";

      xhr.onload = () => {
        this.removeXhr(xhr);
        if (xhr.status === 200) {
          resolve(new Uint8Array(xhr.response as ArrayBuffer));
        } else {
          reject(new Error(`下载失败: HTTP ${xhr.status}`));
        }
      };

      xhr.onerror = () => { this.removeXhr(xhr); reject(new Error("下载网络错误")); };
      xhr.onabort = () => { this.removeXhr(xhr); reject(new Error("下载已取消")); };

      xhr.send();
    });
  }

  /**
   * HTTP 请求封装
   */
  private async httpRequest<T>(
    path: string,
    method: string,
    body: string | null,
    headers: Record<string, string>
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      this.activeXhrs.push(xhr);

      xhr.open(method, url, true);

      // 设置请求头
      Object.entries(headers).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });

      xhr.onload = () => {
        this.removeXhr(xhr);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const responseText = xhr.responseText || '{}';
            const data = JSON.parse(responseText);
            resolve(data);
          } catch {
            reject(new Error("解析响应 JSON 失败"));
          }
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => { this.removeXhr(xhr); reject(new Error("网络请求错误")); };
      xhr.onabort = () => { this.removeXhr(xhr); reject(new Error("请求已取消")); };

      xhr.send(body);
    });
  }

  /**
   * 从活跃 XHR 列表中移除
   */
  private removeXhr(xhr: XMLHttpRequest): void {
    const idx = this.activeXhrs.indexOf(xhr);
    if (idx !== -1) this.activeXhrs.splice(idx, 1);
  }

  /**
   * 取消当前操作
   */
  abort(): void {
    this.aborted = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    // 中止所有活跃的 XHR 请求
    for (const xhr of this.activeXhrs) {
      try { xhr.abort(); } catch { /* ignore */ }
    }
    this.activeXhrs = [];
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.activeXhrs = [];
    // 不重置 aborted，让外部可以检查取消状态
  }
}
