const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname);
const appFile = path.join(srcDir, 'App.jsx');
const code = fs.readFileSync(appFile, 'utf-8');

function extractFunction(startKeyword) {
    const startIdx = code.indexOf(startKeyword);
    if (startIdx === -1) return null;
    
    let openBraces = 0;
    let started = false;
    let endIdx = -1;
    
    for (let i = startIdx; i < code.length; i++) {
        if (code[i] === '{') {
            openBraces++;
            started = true;
        } else if (code[i] === '}') {
            openBraces--;
            if (started && openBraces === 0) {
                endIdx = i;
                break;
            }
        }
    }
    
    if (endIdx !== -1) {
        return code.substring(startIdx, endIdx + 1);
    }
    return null;
}

const appComponent = extractFunction('export default function App()');

const newAppContent = `import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Users, Settings, Upload, CheckCircle, 
  Clock, Mail, Download, Trash2, Send, Plus, 
  FileUp, FileDown, ArrowRight, Eye, RefreshCw, X, LogOut, Lock, Key,
  BarChart2, AlertTriangle, TrendingUp, Calendar, FolderUp, Sun, Moon, Briefcase, Menu, Activity
} from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Commercial module (untouched)
import { CommercialLogin, CommercialDashboard } from './Commercial';
import { ClientPortal } from './ClientPortal';

// HR module
import HRLogin from './hr/HRLogin';
import HRDashboard from './hr/HRDashboard';

// Employee module
import EmployeeLogin from './employee/EmployeeLogin';
import EmployeeDashboard from './employee/EmployeeDashboard';
import EmployeePortal from './employee/EmployeePortal';

// Shared
import ThemeToggle from './shared/ThemeToggle';
import AccessHub from './shared/AccessHub';

pdfjs.GlobalWorkerOptions.workerSrc = \`//unpkg.com/pdfjs-dist@\${pdfjs.version}/build/pdf.worker.min.mjs\`;
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';

${appComponent}
`;

fs.writeFileSync(appFile, newAppContent);
console.log("App.jsx has been rewritten successfully.");
