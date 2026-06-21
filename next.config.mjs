/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*", "172.17.*.*", "172.18.*.*", "172.19.*.*", "172.20.*.*", "172.21.*.*", "172.22.*.*", "172.23.*.*", "172.24.*.*", "172.25.*.*", "172.26.*.*", "172.27.*.*", "172.28.*.*", "172.29.*.*", "172.30.*.*", "172.31.*.*"],
  experimental: {
    serverComponentsExternalPackages: ["cheerio"]
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lain.bgm.tv"
      },
      {
        protocol: "https",
        hostname: "lain.bangumi.tv"
      },
      {
        protocol: "https",
        hostname: "lain.chii.in"
      }
    ]
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/home",
        permanent: false
      }
    ];
  }
};

export default nextConfig;
