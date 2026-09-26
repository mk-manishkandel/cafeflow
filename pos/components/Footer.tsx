import React from 'react';
import { getFooterText } from '../constants/branding';

const Footer: React.FC = () => (
    <footer className="py-2 text-center text-slate-400 text-[10px] border-t border-slate-100 bg-white/50 backdrop-blur-sm shrink-0">
        {getFooterText()}
    </footer>
);

export default Footer;
