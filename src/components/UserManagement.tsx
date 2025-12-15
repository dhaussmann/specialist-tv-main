'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { User, AuthorizedDomain, AuditLogEntry, UserInvitation, AVAILABLE_PERMISSIONS, ROLE_PERMISSIONS } from '@/services/user-manager';
import { getProxiedAvatarUrl } from '@/utils/avatar';
import { NotificationToast } from '@/components/NotificationToast';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { useNotification } from '@/hooks/useNotification';

interface UserManagementProps {
  onClose?: () => void;
}

export function UserManagement({ onClose }: UserManagementProps) {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<'users' | 'domains' | 'audit'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [domains, setDomains] = useState<AuthorizedDomain[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modal states
  const [showUserModal, setShowUserModal] = useState(false);
  const [showDomainModal, setShowDomainModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCancelInviteConfirm, setShowCancelInviteConfirm] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [invitationToCancel, setInvitationToCancel] = useState<UserInvitation | null>(null);
  
  // Notification hook
  const { notification, showSuccess, hideNotification } = useNotification();
  
  // Form states
  const [userForm, setUserForm] = useState({
    role: 'viewer' as 'admin' | 'creator' | 'viewer',
    permissions: [] as string[],
  });
  const [domainForm, setDomainForm] = useState({
    domain: '',
    defaultRole: 'viewer' as 'admin' | 'creator' | 'viewer',
    defaultPermissions: [] as string[],
  });
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'viewer' as 'admin' | 'creator' | 'viewer',
    permissions: [] as string[],
    expiresInDays: 7,
  });

  const loadAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Load all data in parallel
      const [usersResponse, domainsResponse, auditResponse] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/domains'),
        fetch('/api/admin/audit')
      ]);
      
      if (!usersResponse.ok) throw new Error('Failed to load users');
      if (!domainsResponse.ok) throw new Error('Failed to load domains');
      if (!auditResponse.ok) throw new Error('Failed to load audit log');
      
      const [usersData, domainsData, auditData] = await Promise.all([
        usersResponse.json() as Promise<{ users: User[]; invitations: UserInvitation[] }>,
        domainsResponse.json() as Promise<{ domains: AuthorizedDomain[] }>,
        auditResponse.json() as Promise<{ auditLog: AuditLogEntry[] }>
      ]);
      
      setUsers(usersData.users);
      setInvitations(usersData.invitations);
      setDomains(domainsData.domains);
      setAuditLog(auditData.auditLog);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handleUserAction = async (action: string, userId: string, data?: Record<string, unknown>) => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userId, ...data }),
      });
      
      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || 'Action failed');
      }
      
      await loadAllData();
      setShowUserModal(false);
      setSelectedUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  const handleDomainAction = async (action: string, data: Record<string, unknown>) => {
    try {
      const response = await fetch('/api/admin/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...data }),
      });
      
      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || 'Action failed');
      }
      
      await loadAllData();
      setShowDomainModal(false);
      setDomainForm({ domain: '', defaultRole: 'viewer', defaultPermissions: [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  const handleInviteUser = async () => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_invitation', ...inviteForm }),
      });
      
      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || 'Invitation failed');
      }
      
      await loadAllData();
      setShowInviteModal(false);
      setInviteForm({ email: '', role: 'viewer', permissions: [], expiresInDays: 7 });
      showSuccess('Invitation created successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invitation failed');
    }
  };

  const handleCancelInvitation = async () => {
    if (!invitationToCancel) return;
    
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel_invitation', invitationId: invitationToCancel.id }),
      });
      
      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || 'Cancel failed');
      }
      
      await loadAllData();
      setShowCancelInviteConfirm(false);
      setInvitationToCancel(null);
      showSuccess('Invitation cancelled successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed');
      setShowCancelInviteConfirm(false);
      setInvitationToCancel(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'delete_user', 
          userId: userToDelete.id 
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || 'Delete failed');
      }
      
      setShowDeleteConfirm(false);
      setUserToDelete(null);
      await loadAllData(); // Refresh the user list
      showSuccess('User deleted successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const openUserModal = (user: User) => {
    setSelectedUser(user);
    setUserForm({
      role: user.role,
      permissions: user.permissions,
    });
    setShowUserModal(true);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800';
      case 'creator': return 'bg-blue-100 text-blue-800';
      case 'viewer': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-black"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-800">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-sm text-red-600 hover:text-red-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          {[
            { id: 'users', label: 'Users', count: users.length + invitations.length },
            { id: 'domains', label: 'Authorized Domains', count: domains.length },
            { id: 'audit', label: 'Audit Log', count: auditLog.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'users' | 'domains' | 'audit')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </nav>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Users</h2>
            <button
              onClick={() => setShowInviteModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              Invite User
            </button>
          </div>
          
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {/* Pending Invitations */}
              {invitations.map(invitation => {
                const isExpired = invitation.expires_at && new Date(invitation.expires_at) < new Date();
                return (
                  <li key={`invitation-${invitation.id}`}>
                    <div className="px-4 py-4 flex items-center justify-between bg-yellow-50 border-l-4 border-yellow-400">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center">
                            <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">Pending Invitation</div>
                          <div className="text-sm text-black">{invitation.email}</div>
                          {invitation.expires_at && (
                            <div className={`text-xs ${
                              isExpired ? 'text-red-600' : 'text-gray-500'
                            }`}>
                              {isExpired ? 'Expired' : 'Expires'}: {new Date(invitation.expires_at).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(invitation.role)}`}>
                          {invitation.role}
                        </span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          isExpired ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {isExpired ? 'Expired' : 'Pending'}
                        </span>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => {
                              setInvitationToCancel(invitation);
                              setShowCancelInviteConfirm(true);
                            }}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
              
              {/* Existing Users */}
              {users.map(user => (
                <li key={user.id}>
                  <div className="px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        {user.image ? (
                          <Image 
                            className="h-10 w-10 rounded-full" 
                            src={getProxiedAvatarUrl(user.image) || user.image} 
                            alt="User avatar" 
                            width={40} 
                            height={40}
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <span className="text-sm font-medium text-gray-700">
                              {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{user.name || 'No name'}</div>
                        <div className="text-sm text-black">{user.email}</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(user.role)}`}>
                        {user.role}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => openUserModal(user)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Edit
                        </button>
                        {session?.user?.id !== user.id && (
                          <button
                            onClick={() => {
                              setUserToDelete(user);
                              setShowDeleteConfirm(true);
                            }}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Domains Tab */}
      {activeTab === 'domains' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Authorized Domains</h2>
            <button
              onClick={() => setShowDomainModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              Add Domain
            </button>
          </div>
          
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {domains.map(domain => (
                <li key={domain.id}>
                  <div className="px-4 py-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{domain.domain}</div>
                      <div className="text-sm text-black">
                        Default role: {domain.default_role} | 
                        Permissions: {domain.default_permissions.length}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(domain.default_role)}`}>
                        {domain.default_role}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        domain.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {domain.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <button
                        onClick={() => handleDomainAction('remove_domain', { domainId: domain.id })}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Audit Log Tab */}
      {activeTab === 'audit' && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Audit Log</h2>
          
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {auditLog.map(entry => (
                <li key={entry.id}>
                  <div className="px-4 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {entry.action.replace(/_/g, ' ').toUpperCase()}
                        </span>
                        {entry.target_user_name && (
                          <span className="text-sm text-black">
                            → {entry.target_user_name} ({entry.target_user_email})
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-black">{formatDate(entry.created_at)}</div>
                    </div>
                    
                    <div className="mt-2 text-sm text-gray-900">
                      <span className="font-medium">Performed by:</span> {entry.performed_by_name || entry.performed_by_email || entry.performed_by || 'System'}
                    </div>
                    
                    {/* Show old and new values */}
                    {(entry.old_values || entry.new_values) && (
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {entry.old_values && (
                          <div className="bg-red-50 border border-red-200 rounded-md p-3">
                            <h4 className="text-xs font-semibold text-red-800 mb-2">BEFORE</h4>
                            <div className="space-y-1">
                              {Object.entries(entry.old_values).map(([key, value]) => (
                                <div key={key} className="text-xs">
                                  <span className="font-medium text-red-700">{key}:</span>
                                  <span className="ml-1 text-red-600">
                                    {Array.isArray(value) ? value.join(', ') : String(value)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {entry.new_values && (
                          <div className="bg-green-50 border border-green-200 rounded-md p-3">
                            <h4 className="text-xs font-semibold text-green-800 mb-2">AFTER</h4>
                            <div className="space-y-1">
                              {Object.entries(entry.new_values).map(([key, value]) => (
                                <div key={key} className="text-xs">
                                  <span className="font-medium text-green-700">{key}:</span>
                                  <span className="ml-1 text-green-600">
                                    {Array.isArray(value) ? value.join(', ') : String(value)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Additional metadata */}
                    {(entry.ip_address || entry.user_agent) && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                          {entry.ip_address && (
                            <span><strong>IP:</strong> {entry.ip_address}</span>
                          )}
                          {entry.user_agent && (
                            <span><strong>User Agent:</strong> {entry.user_agent.substring(0, 50)}...</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* User Edit Modal */}
      {showUserModal && selectedUser && (
        <div className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-50 p-4" style={{backgroundColor: 'rgba(255, 255, 255, 0.1)'}}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center space-x-3">
                {selectedUser.image ? (
                  <Image 
                    className="h-12 w-12 rounded-full" 
                    src={getProxiedAvatarUrl(selectedUser.image) || selectedUser.image} 
                    alt="User avatar" 
                    width={48} 
                    height={48}
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-gray-300 flex items-center justify-center">
                    <span className="text-lg font-medium text-gray-700">
                      {(selectedUser.name || selectedUser.email || 'U').charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    {selectedUser.name || 'No name'}
                  </h3>
                  <p className="text-sm text-black">{selectedUser.email}</p>
                </div>
              </div>
              <button
                onClick={() => setShowUserModal(false)}
                className="text-gray-400 hover:text-black transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Current Status */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Current Status</h4>
                <div className="flex items-center space-x-4">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getRoleBadgeColor(selectedUser.role)}`}>
                    {selectedUser.role}
                  </span>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    selectedUser.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {selectedUser.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <span className="text-sm text-black">
                    {selectedUser.permissions.length} permissions
                  </span>
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">Role</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['viewer', 'creator', 'admin'] as const).map(role => (
                    <button
                      key={role}
                      onClick={() => {
                        setUserForm({
                          role: role,
                          permissions: ROLE_PERMISSIONS[role] || [],
                        });
                      }}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        userForm.role === role
                          ? 'border-blue-500 bg-blue-50 text-blue-900'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      <div className="text-center">
                        <div className={`w-8 h-8 mx-auto mb-2 rounded-full flex items-center justify-center ${getRoleBadgeColor(role)}`}>
                          {role === 'admin' && '👑'}
                          {role === 'creator' && '✏️'}
                          {role === 'viewer' && '👁️'}
                        </div>
                        <div className="font-medium capitalize">{role}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {ROLE_PERMISSIONS[role]?.length || 0} permissions
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Permissions */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  Permissions ({userForm.permissions.length})
                </label>
                <div className="bg-gray-50 rounded-lg p-4 max-h-48 overflow-y-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {AVAILABLE_PERMISSIONS.map(permission => (
                      <label key={permission} className="flex items-center space-x-3 p-2 rounded-md hover:bg-white transition-colors">
                        <input
                          type="checkbox"
                          checked={userForm.permissions.includes(permission)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setUserForm(prev => ({
                                ...prev,
                                permissions: [...prev.permissions, permission],
                              }));
                            } else {
                              setUserForm(prev => ({
                                ...prev,
                                permissions: prev.permissions.filter(p => p !== permission),
                              }));
                            }
                          }}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="text-sm text-gray-900 font-medium">{permission}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-xl">
              <div className="flex flex-col sm:flex-row justify-between space-y-3 sm:space-y-0 sm:space-x-3">
                <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                  <button
                    onClick={() => handleUserAction('update_role', selectedUser.id, { role: userForm.role })}
                    className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Update Role
                  </button>
                  <button
                    onClick={() => handleUserAction('update_permissions', selectedUser.id, { permissions: userForm.permissions })}
                    className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Update Permissions
                  </button>
                </div>
                
                <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                  {selectedUser.is_active ? (
                    <button
                      onClick={() => handleUserAction('deactivate_user', selectedUser.id)}
                      className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
                      </svg>
                      Deactivate
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUserAction('activate_user', selectedUser.id)}
                      className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Activate
                    </button>
                  )}
                  <button
                    onClick={() => setShowUserModal(false)}
                    className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Domain Add Modal */}
      {showDomainModal && (
        <div className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-50 p-4" style={{backgroundColor: 'rgba(255, 255, 255, 0.1)'}}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center space-x-3">
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">Add Authorized Domain</h3>
                  <p className="text-sm text-black">Configure a new domain for automatic user registration</p>
                </div>
              </div>
              <button
                onClick={() => setShowDomainModal(false)}
                className="text-gray-400 hover:text-black transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Domain Input */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">Domain Name</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="example.com"
                    value={domainForm.domain}
                    onChange={(e) => setDomainForm(prev => ({ ...prev, domain: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 pl-10 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-black"
                  />
                  <svg className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">Default Role</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['viewer', 'creator', 'admin'] as const).map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => {
                        setDomainForm(prev => ({
                          ...prev,
                          defaultRole: role,
                          defaultPermissions: ROLE_PERMISSIONS[role] || [],
                        }));
                      }}
                      className={`p-4 rounded-lg border-2 transition-all hover:shadow-md ${
                        domainForm.defaultRole === role
                          ? 'border-blue-500 bg-blue-50 shadow-md'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-center">
                        <div className={`w-8 h-8 mx-auto mb-2 rounded-full flex items-center justify-center ${getRoleBadgeColor(role)}`}>
                          {role === 'admin' && '👑'}
                          {role === 'creator' && '✏️'}
                          {role === 'viewer' && '👁️'}
                        </div>
                        <div className="font-medium capitalize">{role}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {ROLE_PERMISSIONS[role]?.length || 0} permissions
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Permissions Preview */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  Default Permissions ({domainForm.defaultPermissions.length})
                </label>
                <div className="bg-gray-50 rounded-lg p-4 max-h-32 overflow-y-auto">
                  {domainForm.defaultPermissions.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {domainForm.defaultPermissions.map(permission => (
                        <div key={permission} className="flex items-center space-x-2 text-sm text-gray-700">
                          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>{permission.replace(/_/g, ' ')}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-2">No permissions selected</p>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end space-x-4 p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowDomainModal(false)}
                className="px-6 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-gray-200 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDomainAction('add_domain', domainForm)}
                disabled={!domainForm.domain.trim()}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Add Domain</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite User Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-50 p-4" style={{backgroundColor: 'rgba(255, 255, 255, 0.1)'}}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center space-x-3">
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">Invite New User</h3>
                  <p className="text-sm text-black">Send an invitation to join the platform</p>
                </div>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-gray-400 hover:text-black transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Email Input */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">Email Address</label>
                <div className="relative">
                  <input
                    type="email"
                    placeholder="user@example.com"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 pl-10 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-black"
                  />
                  <svg className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                  </svg>
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">Role</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['viewer', 'creator', 'admin'] as const).map(role => (
                    <button
                      key={role}
                      onClick={() => {
                        setInviteForm(prev => ({
                          ...prev,
                          role: role,
                          permissions: ROLE_PERMISSIONS[role] || [],
                        }));
                      }}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        inviteForm.role === role
                          ? 'border-blue-500 bg-blue-50 text-blue-900'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      <div className="text-center">
                        <div className={`w-8 h-8 mx-auto mb-2 rounded-full flex items-center justify-center ${getRoleBadgeColor(role)}`}>
                          {role === 'admin' && '👑'}
                          {role === 'creator' && '✏️'}
                          {role === 'viewer' && '👁️'}
                        </div>
                        <div className="font-medium capitalize">{role}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {ROLE_PERMISSIONS[role]?.length || 0} permissions
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Permissions Preview */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  Permissions ({inviteForm.permissions.length})
                </label>
                <div className="bg-gray-50 rounded-lg p-4 max-h-32 overflow-y-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {inviteForm.permissions.map(permission => (
                      <div key={permission} className="flex items-center space-x-2 p-2 bg-white rounded-md">
                        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-gray-900 font-medium">{permission}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Expiration */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">Invitation Expires</label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={inviteForm.expiresInDays}
                    onChange={(e) => setInviteForm(prev => ({ ...prev, expiresInDays: parseInt(e.target.value) || 7 }))}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 pr-12 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-black"
                  />
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-500">days</span>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Invitation will expire on {new Date(Date.now() + inviteForm.expiresInDays * 24 * 60 * 60 * 1000).toLocaleDateString()}
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-xl">
              <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3">
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleInviteUser}
                  disabled={!inviteForm.email.trim()}
                  className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Send Invitation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title="Delete User Account"
        message={`Are you sure you want to delete ${userToDelete?.name || userToDelete?.email}? This action cannot be undone and will permanently remove the user account and all associated data.`}
        confirmText="Delete User"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleDeleteUser}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setUserToDelete(null);
        }}
      />

      {/* Cancel Invitation Confirmation Modal */}
      <ConfirmationModal
        isOpen={showCancelInviteConfirm}
        title="Cancel Invitation"
        message={`Are you sure you want to cancel the invitation for ${invitationToCancel?.email}? This will prevent them from using this invitation to join the platform.`}
        confirmText="Cancel Invitation"
        cancelText="Keep Invitation"
        confirmVariant="danger"
        onConfirm={handleCancelInvitation}
        onCancel={() => {
          setShowCancelInviteConfirm(false);
          setInvitationToCancel(null);
        }}
      />

      {/* Notification Toast */}
      <NotificationToast
        message={notification.message}
        type={notification.type}
        isVisible={notification.isVisible}
        onClose={hideNotification}
      />
    </div>
  );
}
