import { Download } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-slate-950 pt-16 pb-8 mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-start gap-8 mb-12">
          <div className="max-w-xs">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-md bg-gradient-primary flex items-center justify-center">
                <Download className="w-3 h-3 text-white" strokeWidth={3} />
              </div>
              <span className="font-display font-bold text-lg text-white">Fast Video Downloader</span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              The fastest, most reliable way to download high-quality videos from your favorite social media platforms. Completely free, no watermarks.
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-12 sm:grid-cols-3">
            <div>
              <h3 className="font-semibold text-white mb-4 text-sm">Product</h3>
              <ul className="space-y-3">
                <li><a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">Supported Sites</a></li>
                <li><a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">API Access</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-4 text-sm">Legal</h3>
              <ul className="space-y-3">
                <li><a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">DMCA</a></li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-slate-500">
            © {new Date().getFullYear()} Fast Video Downloader. All rights reserved. Not affiliated with YouTube, TikTok, or Meta.
          </p>
        </div>
      </div>
    </footer>
  );
}
