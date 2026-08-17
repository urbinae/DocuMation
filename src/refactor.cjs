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
        return {
            start: startIdx,
            end: endIdx,
            content: code.substring(startIdx, endIdx + 1)
        };
    }
    return null;
}

const functionsToExtract = [
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
    const data = extractFunction(fn);
    if (data) {
        results[fn] = data.content;
        console.log(`Extracted: ${fn}`);
    } else {
        console.error(`Failed to extract: ${fn}`);
    }
});

// Common imports for the extracted files
const commonImports = `import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Users, Settings, Upload, CheckCircle, 
  Clock, Mail, Download, Trash2, Send, Plus, 
  FileUp, FileDown, ArrowRight, Eye, RefreshCw, X, LogOut, Lock, Key,
  BarChart2, AlertTriangle, TrendingUp, Calendar, FolderUp, Sun, Moon, Briefcase, Menu, Activity
} from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5173' : '';
`;

// 1. Create hr components
if (!fs.existsSync(path.join(srcDir, 'hr'))) fs.mkdirSync(path.join(srcDir, 'hr'));
if (!fs.existsSync(path.join(srcDir, 'employee'))) fs.mkdirSync(path.join(srcDir, 'employee'));
if (!fs.existsSync(path.join(srcDir, 'shared'))) fs.mkdirSync(path.join(srcDir, 'shared'));

// We need ThemeToggle which is before AccessHub
const themeToggleContent = extractFunction('function ThemeToggle');
if (themeToggleContent) {
    fs.writeFileSync(path.join(srcDir, 'shared', 'ThemeToggle.jsx'), `${commonImports}\nexport ${themeToggleContent.content.replace('function ThemeToggle', 'default function ThemeToggle')}\n`);
}

const hrDashboardContent = `
${commonImports}
import ThemeToggle from '../shared/ThemeToggle';
import DashboardTab from './DashboardTab';
import PayslipsTab from './PayslipsTab';
import DebtorsTab from './DebtorsTab';
import RiskTab from './RiskTab';
import EmployeesTab from './EmployeesTab';
import ConfigTab from './ConfigTab';

export default ${results['function HRDashboard']}
`;
fs.writeFileSync(path.join(srcDir, 'hr', 'HRDashboard.jsx'), hrDashboardContent);

fs.writeFileSync(path.join(srcDir, 'hr', 'DashboardTab.jsx'), `${commonImports}\nexport default ${results['function DashboardTab']}\n`);
fs.writeFileSync(path.join(srcDir, 'hr', 'PayslipsTab.jsx'), `${commonImports}\nexport default ${results['function PayslipsTab']}\n`);
fs.writeFileSync(path.join(srcDir, 'hr', 'DebtorsTab.jsx'), `${commonImports}\nexport default ${results['function DebtorsTab']}\n`);
fs.writeFileSync(path.join(srcDir, 'hr', 'RiskTab.jsx'), `${commonImports}\nexport default ${results['function RiskTab']}\n`);
fs.writeFileSync(path.join(srcDir, 'hr', 'EmployeesTab.jsx'), `${commonImports}\nexport default ${results['function EmployeesTab']}\n`);
fs.writeFileSync(path.join(srcDir, 'hr', 'ConfigTab.jsx'), `${commonImports}\nexport default ${results['function ConfigTab']}\n`);
fs.writeFileSync(path.join(srcDir, 'hr', 'HRLogin.jsx'), `${commonImports}\nimport ThemeToggle from '../shared/ThemeToggle';\nexport default ${results['function HRLogin']}\n`);

// Employee components
fs.writeFileSync(path.join(srcDir, 'employee', 'EmployeeLogin.jsx'), `${commonImports}\nimport ThemeToggle from '../shared/ThemeToggle';\nexport default ${results['function EmployeeLogin']}\n`);
fs.writeFileSync(path.join(srcDir, 'employee', 'EmployeeDashboard.jsx'), `${commonImports}\nimport ThemeToggle from '../shared/ThemeToggle';\nexport default ${results['function EmployeeDashboard']}\n`);
fs.writeFileSync(path.join(srcDir, 'employee', 'EmployeePortal.jsx'), `${commonImports}\nimport ThemeToggle from '../shared/ThemeToggle';\nexport default ${results['function EmployeePortal']}\n`);

// Shared AccessHub
fs.writeFileSync(path.join(srcDir, 'shared', 'AccessHub.jsx'), `${commonImports}\nexport default ${results['function AccessHub']}\n`);

console.log("Successfully wrote all extracted files.");
