const SCHEME_RE = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)(?:[a-zA-Z\d](?:[a-zA-Z\d-]{0,61}[a-zA-Z\d])?)(?:\.(?!-)(?:[a-zA-Z\d](?:[a-zA-Z\d-]{0,61}[a-zA-Z\d])?))*$/;

function isValidHostname(hostname: string): boolean {
  if (hostname === "localhost") {
    return true;
  }

  return IPV4_RE.test(hostname) || HOSTNAME_RE.test(hostname);
}

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

  if (!parsed.hostname || !isValidHostname(parsed.hostname)) {
    throw new Error("请输入有效的域名、IP 或 localhost 地址");
  }

  if (parsed.username || parsed.password) {
    throw new Error("URL 不能包含账号或密码");
  }

  return parsed.toString();
}
