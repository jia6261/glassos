/**
 * GlassOS Full-Stack Edge OS v2.0
 * 整合 3D 玻璃 UI 与 深度代理引擎
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = url.origin;

    // --- 1. 路由分配：根路径返回 GlassOS Pro UI ---
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(generateHTML(origin), {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    // --- 2. 自动检测逻辑：修复迷路的相对路径 ---
    const isProxyPath = url.pathname.startsWith('/http');
    if (!isProxyPath) {
      const referer = request.headers.get("Referer");
      if (referer && referer.includes(origin)) {
        try {
          const refUrl = new URL(referer);
          const refTargetMatch = refUrl.pathname.match(/\/(https?:\/\/[^\/]+)/);
          if (refTargetMatch) {
            const targetBase = refTargetMatch[1];
            return Response.redirect(`${origin}/${targetBase}${url.pathname}${url.search}`, 302);
          }
        } catch (e) {}
      }
      // 兜底策略
      if (url.pathname !== '/' && (url.pathname.length > 2)) {
         return Response.redirect(`${origin}/https://github.com${url.pathname}${url.search}`, 302);
      }
    }

    // --- 3. 强力代理核心逻辑 ---
    const targetUrlStr = url.pathname.slice(1) + url.search;
    try {
      const targetUrl = new URL(targetUrlStr);
      const newHeaders = new Headers(request.headers);
      newHeaders.set("Host", targetUrl.host);
      newHeaders.set("Referer", targetUrl.origin);
      newHeaders.set("Origin", targetUrl.origin);

      const proxyRequest = new Request(targetUrl, {
        method: request.method,
        headers: newHeaders,
        body: request.body,
        redirect: "manual"
      });

      const response = await fetch(proxyRequest);

      // 处理重定向
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("Location");
        if (location) {
          const absoluteLocation = new URL(location, targetUrl.href).href;
          return Response.redirect(`${origin}/${absoluteLocation}`, response.status);
        }
      }

      const contentType = response.headers.get("content-type") || "";
      let responseBody = response.body;

      if (contentType.includes("text/html")) {
        let text = await response.text();
        // 链接重写正则
        text = text.replace(/(href|src)="(?!http|data|#|\/\/)([^"]+)"/g, `$1="/${targetUrl.origin}$2"`);
        text = text.replace(/(href|src)="http([^"]+)"/g, `$1="/http$2"`);
        
        const injection = `
          <script>
            (function() {
              const proxyPrefix = window.location.origin + "/";
              // 拦截跳转
              const originalOpen = window.open;
              window.open = function(url, name, specs) {
                if(url && !url.startsWith(proxyPrefix)) url = proxyPrefix + new URL(url, window.location.href).href;
                return originalOpen(url, name, specs);
              };
            })();
          </script>
        `;
        text = text.replace('<head>', '<head>' + injection);
        responseBody = text;
      }

      const headers = new Headers(response.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      headers.delete("Content-Security-Policy");
      headers.delete("X-Frame-Options");
      const setCookie = headers.get("Set-Cookie");
      if (setCookie) headers.set("Set-Cookie", setCookie.replace(/Domain=[^;]+;?/gi, ""));

      return new Response(responseBody, { status: response.status, headers });
    } catch (e) {
      return new Response("Edge Proxy Error: " + e.message, { status: 500 });
    }
  },
};

function generateHTML(origin) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>GlassOS Pro</title>
    <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/lucide-static@0.321.0/font/lucide.css" rel="stylesheet">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&display=swap');
        body { font-family: 'Inter', sans-serif; background: #000; overflow: hidden; margin: 0; user-select: none; }
        .glass-panel { background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(25px); border: 1px solid rgba(255, 255, 255, 0.2); }
        .app-icon-shadow { box-shadow: 0 10px 20px -5px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.3); }
    </style>
</head>
<body>
    <div id="root"></div>
    <script type="text/babel">
        const { useState, useEffect, useRef } = React;

        const App = () => {
            const [activeApp, setActiveApp] = useState(null);
            const [time, setTime] = useState(new Date());
            const [proxyUrl, setProxyUrl] = useState('');
            const [parallax, setParallax] = useState({ x: 0, y: 0 });

            useEffect(() => {
                const timer = setInterval(() => setTime(new Date()), 1000);
                return () => clearInterval(timer);
            }, []);

            const handleMove = (e) => {
                const x = (e.clientX - window.innerWidth / 2) / 35;
                const y = (e.clientY - window.innerHeight / 2) / 35;
                setParallax({ x, y });
            };

            const launchProxy = (url) => {
                let target = url.trim();
                if(!target) return;
                if(!target.startsWith('http')) target = 'https://' + target;
                setProxyUrl(window.location.origin + '/' + target);
                setActiveApp('browser');
            };

            const apps = [
                { id: 'browser', name: '浏览器', icon: 'lucide-globe', color: 'bg-blue-500' },
                { id: 'calc', name: '计算器', icon: 'lucide-calculator', color: 'bg-orange-500' },
                { id: 'notes', name: '笔记', icon: 'lucide-file-text', color: 'bg-yellow-500' },
                { id: 'photos', name: '相册', icon: 'lucide-image', color: 'bg-emerald-500' },
                { id: 'settings', name: '设置', icon: 'lucide-settings', color: 'bg-zinc-600' },
            ];

            return (
                <div className="relative w-full h-screen overflow-hidden" onMouseMove={handleMove}>
                    {/* 背景视差 */}
                    <div 
                        className="absolute inset-[-10%] w-[120%] h-[120%] z-0 transition-transform duration-500 ease-out"
                        style={{
                            background: 'radial-gradient(circle at 30% 30%, #1e1b4b 0%, #000 100%)',
                            transform: \`translate3d(\${parallax.x}px, \${parallax.y}px, 0)\`
                        }}
                    >
                        <div className="absolute top-1/4 left-1/3 w-64 h-64 bg-blue-600/20 rounded-full blur-[100px]" />
                    </div>

                    {/* 状态栏 */}
                    <div className="relative z-50 flex justify-between px-8 py-4 text-white text-sm font-semibold opacity-90">
                        <span>{time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        <div className="flex gap-2 items-center">
                            <i className="lucide-wifi w-4 h-4"></i>
                            <span className="text-[10px]">5G</span>
                            <i className="lucide-battery w-4 h-4"></i>
                        </div>
                    </div>

                    {/* 桌面图标 */}
                    <div className="relative z-10 grid grid-cols-4 gap-y-10 px-6 pt-10 max-w-md mx-auto">
                        {apps.map(app => (
                            <div 
                                key={app.id} 
                                onClick={() => app.id === 'browser' ? setActiveApp('prompt') : setActiveApp(app.id)}
                                className="flex flex-col items-center gap-2 active:scale-90 transition-transform cursor-pointer"
                            >
                                <div className={\`w-16 h-16 \${app.color} rounded-[20px] flex items-center justify-center text-white app-icon-shadow\`}>
                                    <i className={\`\${app.icon} w-8 h-8\`}></i>
                                </div>
                                <span className="text-[11px] text-white/80 font-medium">{app.name}</span>
                            </div>
                        ))}
                    </div>

                    {/* URL 输入弹窗 */}
                    {activeApp === 'prompt' && (
                        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-6">
                            <div className="glass-panel w-full max-w-sm rounded-3xl p-6 flex flex-col gap-4 animate-in zoom-in duration-300">
                                <h3 className="text-white text-xl font-bold">进入无痕浏览</h3>
                                <input 
                                    autoFocus
                                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white outline-none focus:bg-white/20"
                                    placeholder="输入网址 (例如 github.com)"
                                    onKeyDown={(e) => e.key === 'Enter' && launchProxy(e.target.value)}
                                />
                                <div className="flex gap-3">
                                    <button onClick={() => setActiveApp(null)} className="flex-1 py-3 text-white/60 font-medium">取消</button>
                                    <button onClick={() => {
                                        const val = document.querySelector('input').value;
                                        launchProxy(val);
                                    }} className="flex-1 py-3 bg-white text-black rounded-xl font-bold">前往</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 全屏应用容器 */}
                    {activeApp === 'browser' && (
                        <div className="absolute inset-0 z-[200] bg-white flex flex-col animate-in slide-in-from-bottom duration-500">
                            <div className="h-14 bg-zinc-100 border-b flex items-center px-4 gap-4">
                                <button onClick={() => setActiveApp(null)} className="text-zinc-900 font-bold px-2">退出</button>
                                <div className="flex-1 bg-white border rounded-full px-4 py-1 text-xs text-zinc-400 truncate">
                                    {proxyUrl.replace(window.location.origin + '/', '')}
                                </div>
                            </div>
                            <iframe src={proxyUrl} className="flex-1 w-full border-none" />
                        </div>
                    )}

                    {/* 通用占位符应用 */}
                    {['calc', 'notes', 'photos', 'settings'].includes(activeApp) && (
                        <div className="absolute inset-0 z-[200] bg-zinc-900 flex flex-col items-center justify-center animate-in zoom-in duration-300">
                            <i className="lucide-lock w-16 h-16 text-white/20 mb-4"></i>
                            <p className="text-white/40">该模块在 Edge 模式下已被加密</p>
                            <button onClick={() => setActiveApp(null)} className="mt-8 px-8 py-2 bg-white/10 text-white rounded-full">返回桌面</button>
                        </div>
                    )}

                    {/* 底部 Dock */}
                    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[90%] max-w-sm">
                        <div className="glass-panel rounded-[35px] p-4 flex justify-around shadow-2xl">
                             <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center text-white"><i className="lucide-phone w-7 h-7"></i></div>
                             <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-white"><i className="lucide-message-circle w-7 h-7"></i></div>
                             <div onClick={() => setActiveApp('prompt')} className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-blue-500"><i className="lucide-globe w-7 h-7"></i></div>
                             <div className="w-14 h-14 bg-zinc-700 rounded-2xl flex items-center justify-center text-white"><i className="lucide-camera w-7 h-7"></i></div>
                        </div>
                    </div>
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
