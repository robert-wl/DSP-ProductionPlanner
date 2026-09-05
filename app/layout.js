import './globals.css';

export const metadata = {
    title       : 'DSP Production Planner',
    description : 'Plan Dyson Sphere Program factory chains: pick the items you want per minute and get the buildings, belts and power behind them.'
};

export const viewport = {
    width           : 'device-width',
    initialScale    : 1,
    themeColor      : '#0d1117'
};

export default function RootLayout({children})
{
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
