import { defineConfig, type Plugin } from 'vite';

import aitDevtools from "@apps-in-toss/devtools/unplugin";

/**
 * 링크 미리보기(og:image 등)는 절대 주소가 필요해서, 빌드할 때 사이트 주소를 채워 넣어요.
 * Vercel이 빌드할 때 주는 VERCEL_PROJECT_PRODUCTION_URL(대표 도메인)을 쓰고,
 * 직접 정하고 싶으면 VITE_SITE_URL=https://example.com 으로 덮어쓸 수 있어요.
 * robots.txt와 sitemap.xml도 같은 주소로 만들어요.
 */
function siteMeta(): Plugin {
  const fromVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const site = (process.env.VITE_SITE_URL || (fromVercel ? `https://${fromVercel}` : '')).replace(/\/+$/, '');
  return {
    name: 'site-meta',
    transformIndexHtml(html) {
      // 주소를 모르면(로컬) 주소가 꼭 필요한 줄은 빼고, 이미지는 상대 주소로
      if (!site) return html.replace(/^.*(canonical|og:url).*%SITE_URL%.*\n/gm, '').replaceAll('%SITE_URL%', '');
      return html.replaceAll('%SITE_URL%', site);
    },
    generateBundle() {
      const robots = ['User-agent: *', 'Allow: /', site ? `Sitemap: ${site}/sitemap.xml` : ''].filter(Boolean).join('\n') + '\n';
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
      if (site) {
        const urls = ['/', '/privacy.html'].map((p) => `  <url><loc>${site}${p}</loc></url>`).join('\n');
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n` });
      }
    },
  };
}

/**
 * 방문 통계(Vercel Web Analytics) 스크립트는 배포용 빌드에만 넣어요.
 * 이 주소는 Vercel에 올라간 뒤에야 생겨서, 로컬 개발(npm run dev)에 넣으면 콘솔에 오류만 떠요.
 */
function injectAnalyticsScriptOnBuild(): Plugin {
  return {
    name: 'vercel-analytics',
    transformIndexHtml(_html, ctx) {
      if (ctx.server) return;
      return [{ tag: 'script', attrs: { defer: true, src: '/_vercel/insights/script.js' }, injectTo: 'head' }];
    },
  };
}

export default defineConfig({
  plugins: [aitDevtools.vite(), siteMeta(), injectAnalyticsScriptOnBuild()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
        },
      },
    },
  },
});
