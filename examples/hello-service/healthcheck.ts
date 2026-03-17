export function healthcheck(): { status: string; uptime: number } {
  return { status: "ok", uptime: process.uptime() };
}
