/**
 * Error Translation Module
 * Converts HTTP status codes and network errors to clear Chinese explanations.
 */

const HTTP_STATUS_MAP: Record<number, { name: string; desc: string }> = {
    200: { name: "请求成功", desc: "服务器正常响应，一切正常。" },
    201: { name: "创建成功", desc: "请求已成功处理，并创建了新的资源。" },
    301: { name: "永久重定向", desc: "目标 URL 已被永久移动到新地址。" },
    302: { name: "临时重定向", desc: "目标 URL 临时重定向到其他地址。" },
    400: { name: "客户端请求错误 (Bad Request)", desc: "发送的请求存在语法错误或参数不正确。" },
    401: { name: "未授权 (Unauthorized)", desc: "监控节点没有权限访问该 URL，需要身份验证。" },
    403: { name: "访问被拒绝 (Forbidden)", desc: "监控节点没有权限访问该 URL，通常被 WAF 拦截或禁止访问。" },
    404: { name: "资源未找到 (Not Found)", desc: "目标 URL 不存在，请检查链接是否已失效。" },
    405: { name: "方法不允许 (Method Not Allowed)", desc: "请求方法不被目标服务器允许。" },
    408: { name: "请求超时 (Request Timeout)", desc: "服务器等待请求时超时。" },
    429: { name: "请求过多 (Too Many Requests)", desc: "监控节点发送的请求过于频繁，被限流。" },
    500: { name: "服务器内部错误 (Internal Server Error)", desc: "目标服务器代码抛出异常，无法完成请求。" },
    502: { name: "错误网关 (Bad Gateway)", desc: "目标服务器作为网关或代理，从上游服务器收到了无效响应。" },
    503: { name: "服务不可用 (Service Unavailable)", desc: "目标服务器暂时无法处理请求，可能正在维护或过载。" },
    504: { name: "网关超时 (Gateway Timeout)", desc: "目标服务器未能及时从上游服务器获得响应。" },
};

const NETWORK_ERROR_MAP: Record<string, { name: string; desc: string }> = {
    AbortError: {
        name: "请求超时",
        desc: "服务器在规定的时间内未返回任何数据，请求已被中止。",
    },
    TimeoutError: {
        name: "请求超时",
        desc: "服务器在规定的时间内未返回任何数据。",
    },
    TypeError: {
        name: "网络连接失败",
        desc: "域名解析失败(DNS错误)、服务彻底宕机或 SSL 证书配置不正确。",
    },
    ECONNREFUSED: {
        name: "连接被拒绝",
        desc: "目标服务器拒绝了连接请求，端口可能未监听或服务已停止。",
    },
    ECONNRESET: {
        name: "连接被重置",
        desc: "与目标服务器的连接被异常断开。",
    },
    ENOTFOUND: {
        name: "域名解析失败",
        desc: "无法解析目标域名，请检查域名是否正确或 DNS 配置是否正常。",
    },
    CERT_HAS_EXPIRED: {
        name: "SSL 证书过期",
        desc: "目标服务器的 SSL/TLS 证书已过期，无法建立安全连接。",
    },
};

export function translateHttpStatus(code: number): { name: string; desc: string } {
    if (HTTP_STATUS_MAP[code]) {
        return HTTP_STATUS_MAP[code];
    }
    if (code >= 200 && code < 300) {
        return { name: `成功 (${code})`, desc: "请求已成功处理。" };
    }
    if (code >= 300 && code < 400) {
        return { name: `重定向 (${code})`, desc: "目标 URL 发生了重定向。" };
    }
    if (code >= 400 && code < 500) {
        return { name: `客户端错误 (${code})`, desc: "请求存在客户端错误，服务器无法处理。" };
    }
    if (code >= 500) {
        return { name: `服务器错误 (${code})`, desc: "目标服务器发生了内部错误。" };
    }
    return { name: `未知状态码 (${code})`, desc: "收到了未知的 HTTP 状态码。" };
}

export function translateNetworkError(error: Error): { name: string; desc: string } {
    // Check error name first
    if (NETWORK_ERROR_MAP[error.name]) {
        return NETWORK_ERROR_MAP[error.name];
    }

    // Check error message for known patterns
    const msg = error.message || "";
    for (const [key, value] of Object.entries(NETWORK_ERROR_MAP)) {
        if (msg.includes(key)) {
            return value;
        }
    }

    // Check for fetch failures
    if (msg.includes("fetch") || msg.includes("Failed to fetch")) {
        return NETWORK_ERROR_MAP["TypeError"];
    }

    return {
        name: "未知网络错误",
        desc: `发生了未知的网络错误：${msg || error.name}`,
    };
}
