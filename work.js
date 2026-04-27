```javascript
/**
 * GlassOS 全栈同步引擎 v7.0
 * 部署于 GitHub 仓库: https://github.com/jia6261/glassos
 * 功能：动态 UI 加载 + 深度透明代理 + 智能路径补偿
 */

// UI 来源：指向你仓库中 index.html 的 Raw 链接
const REMOTE_UI_URL = "https://raw.githubusercontent.com/jia6261/glassos/main/index.html";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = url.origin;

    // 1. 首页路由：渲染 GlassOS UI
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return await fetchAndRenderUI();
    }

    // 2. 代理路由：匹配 /http... 或 /https...
    const proxyMatch = url.pathname.match(/^\/(https?:\/.*)/);
    if (proxyMatch) {
      return await handleProxy(proxyMatch[1], request, origin);
    }

    // 3. 智能路径修复：处理页面内部发出的相对路径请求 (如 /assets/main.js)
    return await handlePathRepair(url, request, origin);
  }
};

/**
 * 抓取并渲染 GitHub 上的最新 UI
 */
async function fetchAndRenderUI() {
  try {
    const resp = await fetch(REMOTE_UI_URL);
    if (!resp.ok) throw new Error("无法从 GitHub 抓取 UI 文件");
    
    const html = await resp.text();
    return new Response(html, {
      headers: {
        "Content-Type": "text/html;charset=UTF-8",
        "Cache-Control": "no-cache, no-store, must-revalidate", // 确保开发者修改后即刻生效
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (e) {
    return new Response(`[UI Error] ${e.message}`, { status: 500 });
  }
}

/**
 * 核心代理处理函数
 */
async function handleProxy(targetStr, request, origin) {
  // 修复 URL 拼接中可能丢失的斜杠
  let targetUrlStr = targetStr.replace(/^(https?):\/+/, "$1://");
  const urlParams = new URL(request.url).search;
  
  try {
    const targetUrl = new URL(targetUrlStr + urlParams);
    
    // 构造伪装请求头
    const newHeaders = new Headers(request.headers);
    newHeaders.set("Host", targetUrl.host);
    newHeaders.set("Referer", targetUrl.origin);
    newHeaders.set("Origin", targetUrl.origin);

    const proxyResponse = await fetch(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
      redirect: "manual" // 手动处理重定向以防止域名跳出代理
    });

    // 处理重定向 (301, 302 等)
    if ([301, 302, 303, 307, 308].includes(proxyResponse.status)) {
      const location = proxyResponse.headers.get("Location");
      if (location) {
        const absoluteLocation = new URL(location, targetUrl.href).href;
        return Response.redirect(`${origin}/${absoluteLocation}`, proxyResponse.status);
      }
    }

    const contentType = proxyResponse.headers.get("content-type") || "";
    const headers = new Headers(proxyResponse.headers);
    
    // 允许跨域及 iframe 嵌套
    headers.set("Access-Control-Allow-Origin", "*");
    headers.delete("Content-Security-Policy");
    headers.delete("X-Frame-Options");
    headers.delete("X-Content-Type-Options");

    // 针对 HTML 内容进行深度路径改写
    if (contentType.includes("text/html")) {
      let text = await proxyResponse.text();
      // 修复相对路径
      text = text.replace(/(href|src)="(?!http|data|#|\/\/)([^"]+)"/g, `$1="/${targetUrl.origin}$2"`);
      // 修复绝对路径
      text = text.replace(/(href|src)="(https?:\/\/[^"]+)"/g, `$1="/$2"`);
      
      // 注入客户端 JS 钩子拦截跳转
      const hook = `<script>
        (function(){
          const prefix = window.location.origin + "/";
          const _f = window.fetch;
          window.fetch = function() {
            if(typeof arguments[0]==='string' && arguments[0].startsWith('http') && !arguments[0].startsWith(prefix)) {
              arguments[0] = prefix + arguments[0];
            }
            return _f.apply(this, arguments);
          };
        })();
      </script>`;
      text = text.replace('<head>', '<head>' + hook);
      
      return new Response(text, { status: proxyResponse.status, headers });
    }

    return new Response(proxyResponse.body, { status: proxyResponse.status, headers });
  } catch (e) {
    return new Response(`[Proxy Error] ${e.message}`, { status: 500 });
  }
}

/**
 * 智能修复：根据 Referer 找回丢失的域名
 */
async function handlePathRepair(url, request, origin) {
  const referer = request.headers.get("Referer");
  if (referer && referer.includes(origin)) {
    try {
      const refUrl = new URL(referer);
      // 从 Referer 的路径中提取原始目标网站域名
      const match = refUrl.pathname.match(/\/(https?:\/\/[^\/]+)/);
      if (match) {
        const targetBase = match[1];
        // 自动重定向到完整代理路径
        return Response.redirect(`${origin}/${targetBase}${url.pathname}${url.search}`, 302);
      }
    } catch (e) {}
  }
  return new Response("404 Not Found", { status: 404 });
}

```
