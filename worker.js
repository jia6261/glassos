javascript
/**
 * GlassOS Full-Stack Edge OS
 * 仓库: jia6261/glassos (单文件版)
 * 功能: 内置桌面 UI + 强力跨域代理 + 路径深度修复
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = url.origin;

    // 1. 路由：根路径返回内置的 GlassOS UI
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(generateHTML(origin), {
        headers: { 
          "Content-Type": "text/html;charset=UTF-8",
          "Cache-Control": "public, max-age=3600"
        },
      });
    }

    // 2. 路由：处理代理请求 (/https://...)
    // 匹配路径中包含完整 URL 的情况
    const proxyMatch = url.pathname.match(/^\/(https?:\/.*)/);
    if (proxyMatch) {
      let targetUrlStr = proxyMatch[1].replace(/^(https?):\/+/, "$1://");
      return await handleProxy(targetUrlStr, request, origin);
    }

    // 3. 路由：智能修复丢失域名的相对路径 (核心补丁)
    return await handleAutoRepair(url, request, origin);
  }
};

/**
 * 核心代理处理函数
 */
async function handleProxy(targetUrlStr, request, origin) {
  try {
    const urlParams = new URL(request.url).search;
    const targetUrl = new URL(targetUrlStr + urlParams);
    
    // 构造请求头，伪装来源
    const newHeaders = new Headers(request.headers);
    newHeaders.set("Host", targetUrl.host);
    newHeaders.set("Referer", targetUrl.origin);
    newHeaders.set("Origin", targetUrl.origin);
    // 移除可能导致无法嵌入的特定头部
    newHeaders.delete("x-frame-options");

    const response = await fetch(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
      redirect: "manual" // 手动接管重定向
    });

    // 处理重定向，确保 Location 依然经过代理
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("Location");
      if (location) {
        const absoluteLocation = new URL(location, targetUrl.href).href;
        return Response.redirect(`${origin}/${absoluteLocation}`, response.status);
      }
    }

    const contentType = response.headers.get("content-type") || "";
    const headers = new Headers(response.headers);
    
    // 破解安全策略，允许 iframe 嵌入
    headers.set("Access-Control-Allow-Origin", "*");
    headers.delete("Content-Security-Policy");
    headers.delete("X-Frame-Options");
    headers.delete("X-Content-Type-Options");
    
    // 修复 Cookie 的 Domain 限制
    const setCookie = headers.get("Set-Cookie");
    if (setCookie) {
      headers.set("Set-Cookie", setCookie.replace(/Domain=[^;]+;?/gi, ""));
    }

    // 如果是 HTML 页面，执行深度路径修复
    if (contentType.includes("text/html")) {
      let text = await response.text();
      
      // 1. 修复 HTML 中的相对路径 (href="/abc" -> href="/https://site.com/abc")
      text = text.replace(/(href|src|action)="\/(?!\/)/g, `$1="/${targetUrl.origin}/`);
      
      // 2. 将所有的绝对路径也代理化 (href="https://..." -> href="/https://...")
      text = text.replace(/(href|src|action)="(https?:\/\/[^"]+)"/g, `$1="/$2"`);

      // 3. 注入客户端劫持脚本，拦截 JS 产生的请求
      const script = `
        <script>
        (function() {
          const proxyOrigin = window.location.origin + "/";
          // 劫持 Fetch
          const _fetch = window.fetch;
          window.fetch = function() {
            if(typeof arguments[0] === 'string' && arguments[0].startsWith('http') && !arguments[0].startsWith(proxyOrigin)) {
              arguments[0] = proxyOrigin + arguments[0];
            }
            return _fetch.apply(this, arguments);
          };
          // 劫持跳转
          window.addEventListener('click', e => {
            const a = e.target.closest('a');
            if (a && a.href && !a.href.startsWith(proxyOrigin) && a.href.startsWith('http')) {
               a.href = proxyOrigin + a.href;
            }
          }, true);
        })();
        </script>
      `;
      text = text.replace('<head>', '<head>' + script);
      
      return new Response(text, { status: response.status, headers });
    }

    // 非 HTML 资源（JS/CSS/图片）直接返回
    return new Response(response.body, { status: response.status, headers });
  } catch (e) {
    return new Response(`[代理错误] 目标: ${targetUrlStr}\\n原因: ${e.message}`, { status: 500 });
  }
}

/**
 * 相对路径自动补全逻辑
 */
async function handleAutoRepair(url, request, origin) {
  const referer = request.headers.get("Referer");
  if (referer && referer.includes(origin)) {
    try {
      const refUrl = new URL(referer);
      // 提取 referer 中的目标站点基础路径
      const match = refUrl.pathname.match(/\/(https?:\/\/[^\/]+)/);
      if (match) {
        const targetBase = match[1];
        // 重定向至带完整代理前缀的地址
        return Response.redirect(`${origin}/${targetBase}${url.pathname}${url.search}`, 302);
      }
    } catch (e) {}
  }
  return new Response("Not Found", { status: 404 });
}

/**
 * 生成内置的 GlassOS 前端 HTML
 */
function generateHTML(origin) {
  return \`
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
        .glass { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(25px); border: 1px solid rgba(255, 255, 255, 0.1); }
        .app-icon { transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); cursor: pointer; }
        .app-icon:active { transform: scale(0.85); }
    </style>
</head>
<body>
    <div id="root"></div>
    <script type="text/babel">
        const { useState, useEffect, useRef } = React;

        const Icon = ({ name, size = 28 }) => {
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
            const [currentIframe, setCurrentIframe] = useState('');
            const [time, setTime] = useState(new Date());

            useEffect(() => {
                const timer = setInterval(() => setTime(new Date()), 1000);
                return () => clearInterval(timer);
            }, []);

            const launch = (input) => {
                let target = input.trim();
                if (!target) return;
                if (!target.startsWith('http')) target = 'https://' + target;
                setCurrentIframe(window.location.origin + '/' + target);
                setActiveApp('browser');
            };

            const apps = [
                { id: 'browser', name: '浏览器', color: 'bg-emerald-500', icon: 'Globe' },
                { id: 'notes', name: '笔记', color: 'bg-blue-500', icon: 'FileText' },
                { id: 'monitor', name: '终端', color: 'bg-zinc-800', icon: 'Terminal' },
                { id: 'settings', name: '设置', color: 'bg-zinc-500', icon: 'Settings' }
            ];

            return (
                <div className="h-screen w-screen relative overflow-hidden bg-gradient-to-br from-zinc-900 to-black">
                    {/* 状态栏 */}
                    <div className="flex justify-between px-8 py-3 text-xs font-bold opacity-80">
                        <span>{time.getHours().toString().padStart(2, '0')}:{time.getMinutes().toString().padStart(2, '0')}</span>
                        <div className="flex gap-3">
                            <Icon name="Wifi" size={14} />
                            <Icon name="Battery" size={14} />
                        </div>
                    </div>

                    {/* 桌面应用网格 */}
                    <div className="grid grid-cols-4 gap-8 p-10 pt-16 max-w-xl mx-auto">
                        {apps.map(app => (
                            <div key={app.id} onClick={() => setActiveApp(app.id)} className="flex flex-col items-center gap-2 app-icon">
                                <div className={"w-16 h-16 rounded-[22px] flex items-center justify-center shadow-2xl " + app.color}>
                                    <Icon name={app.icon} size={32} />
                                </div>
                                <span className="text-[10px] font-bold opacity-50 uppercase tracking-widest">{app.name}</span>
                            </div>
                        ))}
                    </div>

                    {/* 底部 Dock */}
                    <div className="absolute bottom-10 left-0 w-full flex justify-center">
                        <div className="glass px-4 py-3 rounded-[32px] flex gap-5">
                            {apps.map(app => (
                                <div key={app.id} onClick={() => setActiveApp(app.id)} className={"w-12 h-12 rounded-2xl flex items-center justify-center cursor-pointer hover:-translate-y-1 transition-all " + app.color}>
                                    <Icon name={app.icon} size={24} />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 应用层级 */}
                    {activeApp === 'browser' && (
                        <div className="fixed inset-0 z-50 bg-white flex flex-col animate-in slide-in-from-bottom duration-500">
                            <div className="h-14 bg-zinc-100 flex items-center px-4 gap-4 border-b border-zinc-200">
                                <button onClick={() => setActiveApp(null)} className="text-zinc-900 font-bold px-2">退出</button>
                                <input 
                                    className="flex-1 bg-white border border-zinc-300 rounded-full px-5 py-1.5 text-zinc-900 outline-none text-sm shadow-sm"
                                    placeholder="搜索或输入网址..."
                                    value={url}
                                    onChange={e => setUrl(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && launch(url)}
                                />
                            </div>
                            <iframe src={currentIframe} className="flex-1 w-full h-full border-none" />
                        </div>
                    )}

                    {activeApp && activeApp !== 'browser' && (
                      <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col p-10">
                         <button onClick={() => setActiveApp(null)} className="text-emerald-500 mb-8 font-bold">← 返回桌面</button>
                         <h1 className="text-4xl font-black mb-4 capitalize">{activeApp}</h1>
                         <p className="text-zinc-500">此模块正在开发中，请使用浏览器功能。</p>
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
  \`;
}
