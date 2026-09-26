import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Users, UserCog, Coffee,
  FileBarChart, ReceiptText, ChevronLeft, ChevronRight,
  LogOut, Shield, Building2, Key, X, AlertCircle,
  ClipboardList, Settings, UserCircle,
  Zap, ShoppingBag, ChevronDown, Smartphone
} from 'lucide-react';

import { APP_NAME, APP_LOGO_URL } from '../constants/branding';
import { usePermission } from '../hooks/usePermission';
import { useBranch } from '../contexts/BranchContext';
import { API_BASE, authenticatedFetch } from '../services/authService';
import { APP_VERSION } from '../constants/version';
import { NavItem } from './sidebar/NavItem';
import { NavGroup } from './sidebar/NavGroup';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

interface SidebarProps {
  className?: string;
  onLinkClick?: () => void;
  isCollapsed?: boolean;
  onToggle?: () => void;
  onLogout?: () => void;
}

import { useAuth } from '../contexts/AuthContext';
import { AccessibleModal } from './ui/AccessibleModal';

const Sidebar = ({ className = '', onLinkClick, isCollapsed = false, onToggle, onLogout }: SidebarProps) => {
  const can = usePermission();
  const { currentBranch } = useBranch();
  const navigate = useNavigate();
  const { user } = useAuth();

  const appName = currentBranch?.name || APP_NAME;

  const canAccessBusinessSetup = can('MANAGE_BRANCHES') || can('MANAGE_PAYMENT_METHODS') || can('MANAGE_EMAIL_CONFIG') || can('MANAGE_EMAIL_TEMPLATES');

  const [isServicesOpen, setIsServicesOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const passwordModalTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up the auto-close timer on unmount
  useEffect(() => {
    return () => {
      if (passwordModalTimeoutRef.current) clearTimeout(passwordModalTimeoutRef.current);
    };
  }, []);

  const handleChangePassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters');
      return;
    }

    setIsChangingPassword(true);
    try {
      const response = await authenticatedFetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await response.json();
      if (response.ok) {
        setPasswordSuccess('Password changed successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        passwordModalTimeoutRef.current = setTimeout(() => setIsPasswordModalOpen(false), 1500);
      } else {
        setPasswordError(data.error || 'Failed to change password');
      }
    } catch (_err) {
      setPasswordError('Network error. Please try again.');
    } finally {
      setIsChangingPassword(false);
    }
  }, [newPassword, confirmPassword, currentPassword]);

  const handleLinkClick = useCallback(() => {
    if (onLinkClick) onLinkClick();
  }, [onLinkClick]);

  const initials = user?.username ? user.username.substring(0, 2).toUpperCase() : 'GU';
  const roleDisplay = user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Guest';

  return (
    <>
      <aside className={`relative z-40 bg-white/80 glass-panel border-r border-slate-200 flex flex-col transition-all duration-100 ${isCollapsed ? 'p-3' : 'p-6'} ${className}`}>
        <div className={`mb-6 flex items-center ${isCollapsed ? 'justify-center flex-col gap-4' : 'justify-between'}`}>
          <div
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => navigate('/dashboard')}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
              <img src={APP_LOGO_URL} alt={`${APP_NAME} logo`} className="w-full h-full object-cover" />
            </div>
            {!isCollapsed && <h1 className="text-xl font-bold text-slate-800 tracking-tight whitespace-nowrap animate-in fade-in duration-100 overflow-hidden text-ellipsis max-w-[160px]" title={appName}>{appName}</h1>}
          </div>
          {onToggle && (
            <button
              onClick={onToggle}
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors hidden md:block"
              title={isCollapsed ? "Expand" : "Collapse"}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!isCollapsed}
            >
              {isCollapsed ? <ChevronRight size={20} aria-hidden="true" /> : <ChevronLeft size={20} aria-hidden="true" />}
            </button>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto min-h-0 custom-scrollbar pr-1 mb-4 pb-6">
          {can('VIEW_DASHBOARD') && (
            <NavItem
              to="/dashboard"
              icon={LayoutDashboard}
              label="Dashboard"
              isCollapsed={isCollapsed}
              onClick={handleLinkClick}
              onMouseEnter={() => {
                // Prefetch dashboard stats
                authenticatedFetch(`${API_BASE}/dashboard/stats`).catch(() => { }); // Silent fail
              }}
            />
          )}
          {can('ACCESS_POS') && (
            <>
              <NavItem to="/pos" icon={ShoppingCart} label="POS Terminal" isCollapsed={isCollapsed} onClick={handleLinkClick} />
              <NavItem to="/pos-n" icon={Zap} label="POS-N Terminal" isCollapsed={isCollapsed} onClick={handleLinkClick} />
            </>
          )}
          {can('SELF_SERVICE_VIEW') && (
            <NavItem to="/self-service" icon={Smartphone} label="Self-Service" isCollapsed={isCollapsed} onClick={handleLinkClick} />
          )}
          {can('MENU_VIEW') && (
            <NavItem to="/menu" icon={Coffee} label="Menu Items" isCollapsed={isCollapsed} onClick={handleLinkClick} />
          )}
          {can('STAFF_VIEW') && (
            <NavItem to="/staff" icon={Users} label="Staff Members" isCollapsed={isCollapsed} onClick={handleLinkClick} />
          )}
          {can('CONSUMER_VIEW') && (
            <NavItem to="/consumers" icon={UserCircle} label="Consumers" isCollapsed={isCollapsed} onClick={handleLinkClick} />
          )}
          {can('TRANSACTION_VIEW') && (
            <NavItem to="/transactions" icon={ReceiptText} label="Transactions" isCollapsed={isCollapsed} onClick={handleLinkClick} />
          )}
          {can('VIEW_REPORTS') && (
            <NavItem to="/consumption-reports" icon={FileBarChart} label="Consumption" isCollapsed={isCollapsed} onClick={handleLinkClick} />
          )}
          {can('VIEW_ITEM_SALES_REPORT') && (
            <NavItem to="/item-sales-report" icon={ShoppingBag} label="Item Sales" isCollapsed={isCollapsed} onClick={handleLinkClick} />
          )}

          {(can('MANAGE_USERS') || can('VIEW_AUDIT_LOGS') || canAccessBusinessSetup) && (
            <NavGroup
              icon={Settings}
              label="Services"
              isCollapsed={isCollapsed}
              isOpen={isServicesOpen}
              onToggle={() => {
                if (isCollapsed && onToggle) {
                  onToggle();
                  setIsServicesOpen(true);
                } else {
                  setIsServicesOpen(!isServicesOpen);
                }
              }}
            >
              {can('MANAGE_USERS') && (
                <>
                  <NavItem to="/users" icon={UserCog} label="User Management" isCollapsed={false} onClick={handleLinkClick} />
                  <NavItem to="/roles" icon={Shield} label="Permissions" isCollapsed={false} onClick={handleLinkClick} />
                </>
              )}
              {canAccessBusinessSetup && (
                <NavItem to="/business-setup" icon={Building2} label="Business Setup" isCollapsed={false} onClick={handleLinkClick} />
              )}
              {can('VIEW_AUDIT_LOGS') && (
                <NavItem to="/audit-logs" icon={ClipboardList} label="Audit Logs" isCollapsed={false} onClick={handleLinkClick} />
              )}
            </NavGroup>
          )}
        </nav>

        <div className="mt-auto mb-2 relative">
          {isProfileMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setIsProfileMenuOpen(false)}
              />
              <div className={`absolute bottom-full ${isCollapsed ? 'left-0 mb-2 w-64' : 'left-0 right-0 mb-2 mx-4'} bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50 animate-in zoom-in-95 duration-100 min-w-[240px]`}>
                <div className="p-4 bg-slate-50 border-b border-slate-100">
                  <p className="text-sm font-bold text-slate-800 truncate" title={user.username}>{user.username}</p>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-0.5">{roleDisplay}</p>
                  <p className="text-xs text-indigo-600 mt-1 truncate">{currentBranch?.name}</p>
                </div>

                <div className="p-1">
                  <button
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      setIsPasswordModalOpen(true);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-colors text-sm font-medium text-left"
                  >
                    <Key size={18} />
                    Change Password
                  </button>

                  {onLogout && (
                    <button
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-red-600 hover:bg-red-50 rounded-xl transition-colors text-sm font-medium text-left"
                    >
                      <LogOut size={18} />
                      Logout
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          <button
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-200 hover:bg-slate-100 ${isCollapsed ? 'justify-center' : 'px-4'}`}
            title="Profile Menu"
            aria-label="Toggle profile menu"
            aria-haspopup="true"
            aria-expanded={isProfileMenuOpen}
          >
            <div 
              className={`w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shrink-0 shadow-md shadow-indigo-200 transition-transform duration-100 ${isProfileMenuOpen ? 'scale-110 ring-2 ring-offset-2 ring-indigo-600' : ''}`}
              aria-hidden="true"
            >
              {initials}
            </div>

            {!isCollapsed && (
              <div className="flex-1 text-left overflow-hidden">
                <p className="text-sm font-bold text-slate-700 truncate">{user.username}</p>
                <p className="text-xs text-slate-400 capitalize truncate">{user.role}</p>
              </div>
            )}

            {!isCollapsed && (
              <ChevronDown size={16} className={`text-slate-400 transition-transform duration-100 ${isProfileMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            )}
          </button>
        </div>

        {!isCollapsed && (
          <div className="text-center py-2">
            <span className="text-xs text-slate-400">v{APP_VERSION}</span>
          </div>
        )}
      </aside>

      <AccessibleModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        hideHeader
        ariaLabelledBy="sidebar-password-title"
        closeOnOverlayClick={false}
        overlayClassName="fixed inset-0 bg-black/50 flex items-center justify-center animate-in fade-in duration-100"
        overlayStyle={{ zIndex: 50 }}
        panelClassName="bg-white rounded-2xl shadow-xl w-full max-w-md m-4 p-6 animate-in zoom-in-95 duration-100"
        bodyClassName="contents"
      >
            <div className="flex justify-between items-center mb-4">
              <h2 id="sidebar-password-title" className="text-xl font-bold text-slate-800">Change Password</h2>
              <button onClick={() => setIsPasswordModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            {passwordError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-red-600 text-sm">
                <AlertCircle size={16} />
                {passwordError}
              </div>
            )}
            {passwordSuccess && (
              <div className="mb-4 p-3 bg-green-50 border border-green-100 rounded-xl text-green-600 text-sm">
                {passwordSuccess}
              </div>
            )}
            <form onSubmit={handleChangePassword} className="space-y-4">
              <Input
                label={<>Current Password <span className="text-red-500">*</span></>}
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
              <Input
                label={<>New Password <span className="text-red-500">*</span></>}
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
              <Input
                label={<>Confirm New Password <span className="text-red-500">*</span></>}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="ghost" onClick={() => setIsPasswordModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={isChangingPassword}>
                  Change Password
                </Button>
              </div>
            </form>
      </AccessibleModal>
    </>
  );
};

export default Sidebar;