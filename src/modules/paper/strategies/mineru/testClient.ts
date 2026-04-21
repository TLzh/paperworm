// MinerU 测试连接功能
// 使用 v4 单文件 URL 接口（/api/v4/extract/task）验证 Token 是否有效
// 文档：https://mineru.net/apiManage/docs

const TEST_PDF_URL = "https://cdn-mineru.openxlab.org.cn/demo/example.pdf";

export class MinerUTestClient {
  /**
   * 测试 MinerU API 连接
   * 提交官方示例 PDF 的解析任务，通过响应判断 Token 是否有效。
   * 注意：此请求会创建一个真实的解析任务，但示例 PDF 极小，几乎不消耗配额。
   */
  static async testConnection(
    token: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!token || token.length < 10) {
      return { success: false, message: "API Token 不能为空或格式不正确" };
    }

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "https://mineru.net/api/v4/extract/task", true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.timeout = 10000;

      xhr.onload = () => {
        // 4xx 响应走 onload，不走 onerror，需单独判断 HTTP 状态
        if (xhr.status === 401 || xhr.status === 403) {
          resolve({
            success: false,
            message: "API Token 无效或已过期，请检查 Token 是否正确",
          });
          return;
        }
        try {
          const data = JSON.parse(xhr.responseText || "{}");
          if (data.code === 0 && data.data?.task_id) {
            resolve({ success: true, message: "连接成功！API Token 有效" });
          } else {
            resolve({
              success: false,
              message: `连接失败：${data.msg || "未知错误"}`,
            });
          }
        } catch {
          resolve({ success: false, message: "解析响应失败" });
        }
      };

      xhr.onerror = () =>
        resolve({ success: false, message: "网络请求错误，请检查网络设置" });
      xhr.ontimeout = () => resolve({ success: false, message: "请求超时" });

      xhr.send(
        JSON.stringify({
          url: TEST_PDF_URL,
          model_version: "vlm",
        }),
      );
    });
  }
}
