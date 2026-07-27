/** 渲染 HTTP Cookie 的可折叠安全配置指引。 */
export function CookieSetupGuide() {
  return (
    <details className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:col-span-2">
      <summary className="cursor-pointer text-xs font-semibold text-stone-700">
        如何安全获取 HTTP Cookie（高级）
      </summary>
      <div className="mt-3 space-y-3 text-xs leading-5 text-stone-600">
        <p>
          Cookie + HTTP 是高级可选模式。普通用户优先选择浏览器扩展或软件自带浏览器；只有明确需要 HTTP
          路由时才填写。
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>在准备与本工具配合的浏览器账号中登录小红书网页版。</li>
          <li>
            打开浏览器开发者工具的“网络（Network）”，刷新页面，选择发往 www.xiaohongshu.com 的请求。
          </li>
          <li>
            在“请求标头（Request Headers）”中分别复制 Cookie 和 User-Agent 后面的值；不要复制
            Set-Cookie、整条 cURL 或其他请求头。
          </li>
          <li>
            将 Cookie 粘贴到上方密码输入框，并把 User-Agent 填入同名设置后保存。
            混合路由要求它与浏览器模式使用同一账号。
          </li>
        </ol>
        <p className="text-stone-600">
          Cookie
          只保存在本机且不会再次显示。不要把它发送到聊天、截图或日志中；如有泄露，请立即在设置中清除并退出对应网页账号。
        </p>
      </div>
    </details>
  );
}
