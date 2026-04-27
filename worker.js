```javascript
/**
 * GlassOS Full-Stack Engine (Single File Edition)
 * 包含完整的前端 UI 与强力代理后端
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = url.origin;

    // --- 1. 路由：根路径返回内置的 GlassOS UI ---
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(generateHTML(origin), {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    // --- 2. 路由：处理代理请求 (/https://...) ---
    const proxyMatch = url.pathname.match(/^\/(https?:\/.*)/);
    if (proxyMatch) {
      let targetUrlStr = proxyMatch[1].replace(/^(https?):\/+/, "$1://");
      return await handleProxy(targetUrlStr, request, origin);
    }

    // --- 3. 路由：智能修复相对路径 (针对网页内部请求) ---
    return await handleAutoRepair(url, request, origin);
  }
};

/**
 * 处理强力代理转发
 */
async function handleProxy(targetUrlStr, request, origin) {
  try {
    const targetUrl = new URL(targetUrlStr + new URL(request.url).search);
    const newHeaders = new Headers(request.headers);
    newHeaders.set("Host", targetUrl.host);
    newHeaders.set("Referer", targetUrl.origin);
    newHeaders.set("Origin", targetUrl.origin);

    const response = await fetch(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
      redirect: "manual"
    });

    // 处理重定向，保持在代理内
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("Location");
      if (location) {
        const absoluteLocation = new URL(location, targetUrl.href).href;
        return Response.redirect(`${origin}/${absoluteLocation}`, response.status);
      }
    }

    const contentType = response.headers.get("content-type") || "";
    const headers = new Headers(response.headers);
    
    // 破解安全头
    headers.set("Access-Control-Allow-Origin", "*");
    headers.delete("Content-Security-Policy");
    headers.delete("X-Frame-Options");
    headers.delete("X-Content-Type-Options");

    // 修改 Cookie 域
    const setCookie = headers.get("Set-Cookie");
    if (setCookie) headers.set("Set-Cookie", setCookie.replace(/Domain=[^;]+;?/gi, ""));

    // 如果是 HTML，注入路径重写和 JS 劫持
    if (contentType.includes("text/html")) {
      let text = await response.text();
      // 修复链接和资源路径
      text = text.replace(/(href|src)="(?!http|data|#|\/\/)([^"]+)"/g, `$1="/${targetUrl.origin}$2"`);
      text = text.replace(/(href|src)="http([^"]+)"/g, `$1="/http$2"`);
      
      // 注入 JS 劫持，拦截动态加载的资源
      const script = `
        <script>
        (function() {
          const p = window.location.origin + "/";
          const _f = window.fetch;
          window.fetch = function() {
            if(typeof arguments[0]==='string' && arguments[0].startsWith('http') && !arguments[0].startsWith(p)) {
              arguments[0] = p + arguments[0];
            }
            return _f.apply(this, arguments);
          };
        })();
        </script>
      `;
      text = text.replace('<head>', '<head>' + script);
      return new Response(text, { status: response.status, headers });
    }

    return new Response(response.body, { status: response.status, headers });
  } catch (e) {
    return new Response("Proxy Error: " + e.message, { status: 500 });
  }
}

/**
 * 智能路径补全
 */
async function handleAutoRepair(url, request, origin) {
  const referer = request.headers.get("Referer");
  if (referer && referer.includes(origin)) {
    try {
      const refUrl = new URL(referer);
      const match = refUrl.pathname.match(/\/(https?:\/\/[^\/]+)/);
      if (match) {
        return Response.redirect(`${origin}/${match[1]}${url.pathname}${url.search}`, 302);
      }
    } catch (e) {}
  }
  return new Response("Not Found", { status: 404 });
}

/**
 * 内置 GlassOS 前端界面
 */
function generateHTML(origin) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>GlassOS Edge</title>
    <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;900&display=swap');
        body { font-family: 'Inter', sans-serif; background: #000; color: white; overflow: hidden; margin: 0; }
        .glass { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.1); }
        .app-card { transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); cursor: pointer; }
        .app-card:active { transform: scale(0.9); }
    </style>
</head>
<body>
    <div id="root"></div>
    <script type="text/babel">
        const { useState, useEffect, useRef } = React;

        const Icon = ({ name, size = 24 }) => {
            const ref = useRef(null);
            useEffect(() => {
                if (ref.current && window.lucide) {
                    const icon = lucide[name] || lucide.Globe;
                    ref.current.innerHTML = icon.toSvg({ width: size, height: size });
                }
            }, [name]);
            return <span ref={ref} className="inline-block" />;
        };

        const App = () => {
            const [activeApp, setActiveApp] = useState(null);
            const [url, setUrl] = useState('');
            const [browserUrl, setBrowserUrl] = useState('');

            const openBrowser = (input) => {
                let target = input.trim();
                if (!target) return;
                if (!target.startsWith('http')) target = 'https://' + target;
                setBrowserUrl(window.location.origin + '/' + target);
                setActiveApp('browser');
            };

            const apps = [
                { id: 'browser', name: '浏览器', color: 'bg-emerald-500', icon: 'Globe' },
                { id: 'settings', name: '设置', color: 'bg-zinc-600', icon: 'Settings' },
                { id: 'terminal', name: '终端', color: 'bg-black', icon: 'Terminal' }
            ];

            return (
                <div className="h-screen w-screen flex flex-col items-center justify-start pt-20">
                    <div className="grid grid-cols-4 gap-8 px-10 max-w-2xl w-full">
                        {apps.map(app => (
                            <div key={app.id} onClick={() => setActiveApp(app.id)} className="flex flex-col items-center gap-2 app-card">
                                <div className={"w-16 h-16 rounded-[22px] flex items-center justify-center shadow-2xl " + app.color}>
                                    <Icon name={app.icon} size={32} />
                                </div>
                                <span className="text-[10px] font-bold opacity-60 uppercase tracking-tighter">{app.name}</span>
                            </div>
                        ))}
                    </div>

                    {/* Dock */}
                    <div className="absolute bottom-10 glass p-3 rounded-[32px] flex gap-4">
                        {apps.map(app => (
                            <div key={app.id} onClick={() => setActiveApp(app.id)} className={"w-12 h-12 rounded-2xl flex items-center justify-center " + app.color}>
                                <Icon name={app.icon} size={24} />
                            </div>
                        ))}
                    </div>

                    {/* 浏览器窗口 */}
                    {activeApp === 'browser' && (
                        <div className="fixed inset-0 bg-white z-50 flex flex-col animate-in slide-in-from-bottom duration-300">
                            <div className="h-14 bg-zinc-100 flex items-center px-4 gap-4 border-b">
                                <button onClick={() => setActiveApp(null)} className="text-black font-bold px-2">退出</button>
                                <input 
                                    className="flex-1 bg-white border border-zinc-300 rounded-full px-4 py-1.5 text-black outline-none text-sm"
                                    placeholder="输入网址..."
                                    value={url}
                                    onChange={e => setUrl(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && openBrowser(url)}
                                />
                            </div>
                            <iframe src={browserUrl} className="flex-1 w-full h-full border-none" />
                        </div>
                    )}
                </div>
            );
        };

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<App />);
    </script>
</body>
</html>
  `;
}

```
