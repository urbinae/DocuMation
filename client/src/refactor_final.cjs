const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname);
const appFile = path.join(srcDir, 'App.jsx');
const code = fs.readFileSync(appFile, 'utf-8');

function extractFunction(startKeyword) {
    const startIdx = code.indexOf(startKeyword);
    if (startIdx === -1) return null;
    
    const paramEndIdx = code.indexOf(')', startIdx);
    const bodyStartIdx = code.indexOf('{', paramEndIdx);
    
    let openBraces = 0;
    let started = false;
    let endIdx = -1;
    
    for (let i = bodyStartIdx; i < code.length; i++) {
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

const functionsToExtract = [
    'function ThemeToggle',
    'function AccessHub',
    'function HRLogin',
    'function EmployeeLogin',
    'function HRDashboard',
    'function DashboardTab',
    'function PayslipsTab',
    'function DebtorsTab',
    'function RiskTab',
    'function EmployeesTab',
    'function ConfigTab',
    'function EmployeeDashboard',
    'function EmployeePortal'
];

const results = {};
functionsToExtract.forEach(fn => {
    const content = extractFunction(fn);
    if (content) {
        results[fn] = content;
        console.log(`Extracted: ${fn}`);
    } else {
        console.warn(`Could not extract: ${fn}`);
    }
});

const commonImports = `import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Users, Settings, Upload, CheckCircle, 
  Clock, Mail, Download, Trash2, Send, Plus, 
  FileUp, FileDown, ArrowRight, Eye, RefreshCw, X, LogOut, Lock, Key,
  BarChart2, AlertTriangle, TrendingUp, Calendar, FolderUp, Sun, Moon, Briefcase, Menu, Activity
} from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';
`;

function addExportDefault(content, funcName) {
    if (!content) return '';
    return content.replace(new RegExp('function ' + funcName), 'export default function ' + funcName);
}

// Shared
if (results['function ThemeToggle']) fs.writeFileSync(path.join(srcDir, 'shared', 'ThemeToggle.jsx'), `${commonImports}\n${addExportDefault(results['function ThemeToggle'], 'ThemeToggle')}\n`);
if (results['function AccessHub']) fs.writeFileSync(path.join(srcDir, 'shared', 'AccessHub.jsx'), `${commonImports}\n${addExportDefault(results['function AccessHub'], 'AccessHub')}\n`);

// HR
const hrDashboardContent = `
${commonImports}
import ThemeToggle from '../shared/ThemeToggle';
import DashboardTab from './DashboardTab';
import PayslipsTab from './PayslipsTab';
import DebtorsTab from './DebtorsTab';
import RiskTab from './RiskTab';
import EmployeesTab from './EmployeesTab';
import ConfigTab from './ConfigTab';

${addExportDefault(results['function HRDashboard'], 'HRDashboard')}
`;
if (results['function HRDashboard']) fs.writeFileSync(path.join(srcDir, 'hr', 'HRDashboard.jsx'), hrDashboardContent);
if (results['function DashboardTab']) fs.writeFileSync(path.join(srcDir, 'hr', 'DashboardTab.jsx'), `${commonImports}\n${addExportDefault(results['function DashboardTab'], 'DashboardTab')}\n`);
if (results['function PayslipsTab']) fs.writeFileSync(path.join(srcDir, 'hr', 'PayslipsTab.jsx'), `${commonImports}\n${addExportDefault(results['function PayslipsTab'], 'PayslipsTab')}\n`);
if (results['function DebtorsTab']) fs.writeFileSync(path.join(srcDir, 'hr', 'DebtorsTab.jsx'), `${commonImports}\n${addExportDefault(results['function DebtorsTab'], 'DebtorsTab')}\n`);
if (results['function RiskTab']) fs.writeFileSync(path.join(srcDir, 'hr', 'RiskTab.jsx'), `${commonImports}\n${addExportDefault(results['function RiskTab'], 'RiskTab')}\n`);
if (results['function EmployeesTab']) fs.writeFileSync(path.join(srcDir, 'hr', 'EmployeesTab.jsx'), `${commonImports}\n${addExportDefault(results['function EmployeesTab'], 'EmployeesTab')}\n`);
if (results['function ConfigTab']) fs.writeFileSync(path.join(srcDir, 'hr', 'ConfigTab.jsx'), `${commonImports}\n${addExportDefault(results['function ConfigTab'], 'ConfigTab')}\n`);
if (results['function HRLogin']) fs.writeFileSync(path.join(srcDir, 'hr', 'HRLogin.jsx'), `${commonImports}\nimport ThemeToggle from '../shared/ThemeToggle';\n${addExportDefault(results['function HRLogin'], 'HRLogin')}\n`);

// Employee
if (results['function EmployeeLogin']) fs.writeFileSync(path.join(srcDir, 'employee', 'EmployeeLogin.jsx'), `${commonImports}\nimport ThemeToggle from '../shared/ThemeToggle';\n${addExportDefault(results['function EmployeeLogin'], 'EmployeeLogin')}\n`);
if (results['function EmployeeDashboard']) fs.writeFileSync(path.join(srcDir, 'employee', 'EmployeeDashboard.jsx'), `${commonImports}\nimport ThemeToggle from '../shared/ThemeToggle';\n${addExportDefault(results['function EmployeeDashboard'], 'EmployeeDashboard')}\n`);
if (results['function EmployeePortal']) fs.writeFileSync(path.join(srcDir, 'employee', 'EmployeePortal.jsx'), `${commonImports}\nimport ThemeToggle from '../shared/ThemeToggle';\n${addExportDefault(results['function EmployeePortal'], 'EmployeePortal')}\n`);

// App.jsx rewriting
const appStartIdx = code.indexOf('export default function App()');
const appEndIdx = code.indexOf('function AccessHub');
let appComponentCode = '';
if (appStartIdx !== -1 && appEndIdx !== -1) {
    appComponentCode = code.substring(appStartIdx, appEndIdx);
} else {
    // try brace matching
    appComponentCode = extractFunction('export default function App()');
}

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

${appComponentCode}
`;

fs.writeFileSync(appFile, newAppContent);
console.log("Extraction and rewrite completed.");
