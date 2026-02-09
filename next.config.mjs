/** @type {import('next').NextConfig} */
const nextConfig = {
    // ✅ deprecated 키 이동
    serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core', 'handlebars', 'pdfjs-dist'],

    // ✅ Turbopack 명시
    turbopack: {},

    // ✅ webpack 커스텀 유지 (필요하면)
    webpack: (config) => {
        config.resolve.alias = {
            ...config.resolve.alias,
            handlebars: 'handlebars/dist/handlebars.js',
        };
        return config;
    },
};

export default nextConfig;
