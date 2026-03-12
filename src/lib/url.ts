const SCHEME_RE = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//;
export function normalizeMonitorUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("URL 不能为空");
  }

  const candidate = SCHEME_RE.test(trimmed) ? trimmed : `http://${trimmed}`;
  const parsed = new URL(candidate);

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("仅支持 http 或 https 协议");
  }

  if (!parsed.hostname) {
    throw new Error("请输入有效的域名或 IP 地址");
  }

  if (parsed.username || parsed.password) {
    throw new Error("URL 不能包含账号或密码");
  }

  return parsed.toString();
}
