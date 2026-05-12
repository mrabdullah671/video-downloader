import { Link } from "wouter";
import { Download, Github, Twitter } from "lucide-react";

export function Navbar() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 glass-panel border-b border-white/5 border-t-0 border-x-0 rounded-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Download className="w-4 h-4 text-white" strokeWidth={3} />
          </div>
          <Link href="/" className="font-display font-bold text-xl tracking-tight text-white hover:opacity-80 transition-opacity">
            Fast<span className="text-gradient">VideoDownloader</span>
          </Link>
        </div>

        <div className="hidden md:flex items-center gap-6">
          <a href="#how-it-works" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">How it works</a>
          <a href="#platforms" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">Platforms</a>
          <a href="#faq" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">FAQ</a>
        </div>

        <div className="flex items-center gap-4">
          <a href="https://twitter.com" target="_blank" rel="noreferrer" className="text-slate-400 hover:text-white transition-colors">
            <Twitter className="w-5 h-5" />
          </a>
          <a href="https://github.com" target="_blank" rel="noreferrer" className="text-slate-400 hover:text-white transition-colors">
            <Github className="w-5 h-5" />
          </a>
        </div>
      </div>
    </nav>
  );
}
