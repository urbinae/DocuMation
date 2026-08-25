const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname);
const appFile = path.join(srcDir, 'App.jsx');

const codeLines = fs.readFileSync(appFile, 'utf-8').split('\n');

function getLines(start, end) {
    // start and end are 1-based, array is 0-based
    return codeLines.slice(start - 1, end).join('\n');
}

const components = {
    'AccessHub': getLines(381, 467), // 381 is the comment for AccessHub
    'HRLogin': getLines(468, 739),
    'EmployeeLogin': getLines(740, 935),
    'HRDashboard': getLines(936, 1177),
    'DashboardTab': getLines(1178, 1705),
    'DebtorsTab': getLines(1706, 1837),
    'PayslipsTab': getLines(1838, 3247),
    'EmployeesTab': getLines(3248, 3573),
    'ConfigTab': getLines(3574, 4145),
    'EmployeeDashboard': getLines(4146, 4420),
    'EmployeePortal': getLines(4421, 4927),
    'RiskTab': getLines(4928, 5014)
};

// Common imports for the extracted files
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

// Create directories
if (!fs.existsSync(path.join(srcDir, 'hr'))) fs.mkdirSync(path.join(srcDir, 'hr'));
if (!fs.existsSync(path.join(srcDir, 'employee'))) fs.mkdirSync(path.join(srcDir, 'employee'));
if (!fs.existsSync(path.join(srcDir, 'shared'))) fs.mkdirSync(path.join(srcDir, 'shared'));

// ThemeToggle (Lines 18 to 54)
const themeToggleContent = getLines(18, 54);
fs.writeFileSync(path.join(srcDir, 'shared', 'ThemeToggle.jsx'), `${commonImports}\nexport default ${themeToggleContent.replace('function ThemeToggle', 'function ThemeToggle')}\n`); // Wait, need to export default

// Use regex to add export default
function addExportDefault(content, funcName) {
    return content.replace(new RegExp('function ' + funcName), 'export default function ' + funcName);
}

fs.writeFileSync(path.join(srcDir, 'shared', 'ThemeToggle.jsx'), `${commonImports}\n${addExportDefault(themeToggleContent, 'ThemeToggle')}\n`);

// HR components
const hrDashboardContent = `
${commonImports}
import ThemeToggle from '../shared/ThemeToggle';
import DashboardTab from './DashboardTab';
import PayslipsTab from './PayslipsTab';
import DebtorsTab from './DebtorsTab';
import RiskTab from './RiskTab';
import EmployeesTab from './EmployeesTab';
import ConfigTab from './ConfigTab';

${addExportDefault(components['HRDashboard'], 'HRDashboard')}
`;
fs.writeFileSync(path.join(srcDir, 'hr', 'HRDashboard.jsx'), hrDashboardContent);

fs.writeFileSync(path.join(srcDir, 'hr', 'DashboardTab.jsx'), `${commonImports}\n${addExportDefault(components['DashboardTab'], 'DashboardTab')}\n`);
fs.writeFileSync(path.join(srcDir, 'hr', 'PayslipsTab.jsx'), `${commonImports}\n${addExportDefault(components['PayslipsTab'], 'PayslipsTab')}\n`);
fs.writeFileSync(path.join(srcDir, 'hr', 'DebtorsTab.jsx'), `${commonImports}\n${addExportDefault(components['DebtorsTab'], 'DebtorsTab')}\n`);
fs.writeFileSync(path.join(srcDir, 'hr', 'RiskTab.jsx'), `${commonImports}\n${addExportDefault(components['RiskTab'], 'RiskTab')}\n`);
fs.writeFileSync(path.join(srcDir, 'hr', 'EmployeesTab.jsx'), `${commonImports}\n${addExportDefault(components['EmployeesTab'], 'EmployeesTab')}\n`);
fs.writeFileSync(path.join(srcDir, 'hr', 'ConfigTab.jsx'), `${commonImports}\n${addExportDefault(components['ConfigTab'], 'ConfigTab')}\n`);
fs.writeFileSync(path.join(srcDir, 'hr', 'HRLogin.jsx'), `${commonImports}\nimport ThemeToggle from '../shared/ThemeToggle';\n${addExportDefault(components['HRLogin'], 'HRLogin')}\n`);

// Employee components
fs.writeFileSync(path.join(srcDir, 'employee', 'EmployeeLogin.jsx'), `${commonImports}\nimport ThemeToggle from '../shared/ThemeToggle';\n${addExportDefault(components['EmployeeLogin'], 'EmployeeLogin')}\n`);
fs.writeFileSync(path.join(srcDir, 'employee', 'EmployeeDashboard.jsx'), `${commonImports}\nimport ThemeToggle from '../shared/ThemeToggle';\n${addExportDefault(components['EmployeeDashboard'], 'EmployeeDashboard')}\n`);
fs.writeFileSync(path.join(srcDir, 'employee', 'EmployeePortal.jsx'), `${commonImports}\nimport ThemeToggle from '../shared/ThemeToggle';\n${addExportDefault(components['EmployeePortal'], 'EmployeePortal')}\n`);

// Shared AccessHub
fs.writeFileSync(path.join(srcDir, 'shared', 'AccessHub.jsx'), `${commonImports}\n${addExportDefault(components['AccessHub'], 'AccessHub')}\n`);

// App.jsx
const appTop = getLines(1, 17);
const appComponent = getLines(56, 380);

const newAppContent = `${appTop}

// Shared
import ThemeToggle from './shared/ThemeToggle';
import AccessHub from './shared/AccessHub';

// HR module
import HRLogin from './hr/HRLogin';
import HRDashboard from './hr/HRDashboard';

// Employee module
import EmployeeLogin from './employee/EmployeeLogin';
import EmployeeDashboard from './employee/EmployeeDashboard';
import EmployeePortal from './employee/EmployeePortal';

${appComponent}
`;

fs.writeFileSync(appFile, newAppContent);
console.log("Successfully wrote all extracted files by exact lines.");
