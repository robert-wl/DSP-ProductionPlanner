/** @type {import('next').NextConfig} */
const nextConfig = {
    // The planner renders whatever image URLs the game-data API hands it, into
    // plain <img> tags inside worker-generated HTML, so next/image is not in play.
    images  : { unoptimized: true },
    eslint  : { ignoreDuringBuilds: true }
};

export default nextConfig;
