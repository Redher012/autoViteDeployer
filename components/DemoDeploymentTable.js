'use client';

import { useState, useEffect } from 'react';

export default function DemoDeploymentTable() {
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDeployments = async () => {
    try {
      const response = await fetch('/api/demo/deployments');
      const data = await response.json();
      setDeployments(data.deployments || []);
    } catch (error) {
      console.error('Error fetching deployments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeployments();
    // Refresh every 5 seconds
    const interval = setInterval(fetchDeployments, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleDelete = async (id, isDemo) => {
    if (!isDemo) {
      alert('You can only remove your own demo projects');
      return;
    }

    if (!confirm('Are you sure you want to remove this deployment?')) {
      return;
    }

    try {
      const response = await fetch(`/api/deployments/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to delete' }));
        throw new Error(errorData.error || 'Failed to delete deployment');
      }

      fetchDeployments();
    } catch (error) {
      alert(`Failed to delete: ${error.message}`);
    }
  };

  const handleCopyUrl = async (subdomain, event) => {
    const url = `https://${subdomain}.server.appstetic.com`;
    try {
      await navigator.clipboard.writeText(url);
      const button = event?.target?.closest('button');
      if (button) {
        const originalText = button.innerHTML;
        button.innerHTML = `
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
          Copied!
        `;
        setTimeout(() => {
          button.innerHTML = originalText;
        }, 2000);
      }
    } catch (error) {
      const textArea = document.createElement('textarea');
      textArea.value = url;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        alert('URL copied to clipboard!');
      } catch (err) {
        alert('Failed to copy URL. Please copy manually: ' + url);
      }
      document.body.removeChild(textArea);
    }
  };

  const handleDownload = async (id, isDemo, filePath) => {
    if (!isDemo) {
      alert('You can only download your own demo projects');
      return;
    }

    try {
      const response = await fetch(`/api/deployments/${id}/download`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to download' }));
        alert(`Failed to download: ${errorData.error || 'Unknown error'}`);
        return;
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('zip')) {
        const text = await response.text();
        console.error('Unexpected content type, response:', text.substring(0, 200));
        alert('Server returned unexpected content type. Check console for details.');
        return;
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filePath.split('/').pop() || 'download.zip';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download error:', error);
      alert(`Failed to download: ${error.message}`);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running':
        return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300';
      case 'processing':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300';
      case 'failed':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300';
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'running':
        return '✓';
      case 'processing':
        return '⟳';
      case 'failed':
        return '✗';
      default:
        return '○';
    }
  };

  const getTimeRemaining = (expiresAt) => {
    if (!expiresAt) return null;
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires - now;
    if (diff <= 0) return 'Expired';
    const minutes = Math.floor(diff / 60000);
    return `${minutes} min`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 dark:border-blue-400"></div>
      </div>
    );
  }

  if (deployments.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        No deployments yet. Upload a project to get started!
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
      {deployments.map((deployment) => {
        const isDemo = deployment.is_demo === true || deployment.is_demo === 1;
        const timeRemaining = isDemo ? getTimeRemaining(deployment.expires_at) : null;
        const isExpired = deployment.is_expired === true;
        const canManage = isDemo && !isExpired;

        return (
          <div
            key={deployment.id}
            className={`flex flex-col h-full bg-white dark:bg-gray-800 rounded-lg shadow-md border overflow-hidden hover:shadow-lg transition-shadow ${
              isDemo 
                ? 'border-gray-200 dark:border-gray-700' 
                : 'border-blue-200 dark:border-blue-800'
            }`}
          >
            {/* Top row: time remaining (demo) + status badge - same height */}
            <div className="flex items-center justify-between gap-2 px-4 py-2 min-h-[40px] shrink-0 border-b border-gray-100 dark:border-gray-700">
              <div className="min-w-0">
                {isDemo ? (
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300">
                    {isExpired ? '⏰ Expired' : timeRemaining ? `⏰ ${timeRemaining} left` : 'Demo'}
                  </span>
                ) : (
                  <span className="text-xs text-blue-600 dark:text-blue-400">Owner</span>
                )}
              </div>
              <span
                className={`inline-flex items-center shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium shadow-sm ${getStatusColor(
                  deployment.status
                )}`}
              >
                <span className="mr-1">{getStatusIcon(deployment.status)}</span>
                {deployment.status}
              </span>
            </div>

            {/* Screenshot Preview */}
            <div className="relative aspect-video bg-gray-200 dark:bg-gray-800 overflow-hidden group shrink-0">
              {deployment.screenshot_path ? (
                <>
                  <img
                    src={`/api/screenshots/${(deployment.screenshot_path || '').split('/').pop() || ''}?v=${deployment.updated_at || Date.now()}`}
                    alt={`Screenshot of ${deployment.site_name}`}
                    className="absolute inset-0 w-full h-full object-cover object-top"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      const fallback = e.target.nextElementSibling;
                      if (fallback) fallback.style.display = 'flex';
                    }}
                  />
                  <div
                    className="absolute inset-0 hidden flex-col items-center justify-center gap-2 text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-800"
                    style={{ display: 'none' }}
                  >
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm">Preview unavailable</span>
                  </div>
                  {deployment.status === 'running' && (
                    <div className="absolute inset-0 pointer-events-none group-hover:pointer-events-auto bg-transparent group-hover:bg-black/50 transition-all flex items-center justify-center z-10">
                      <a
                        href={`https://${deployment.subdomain}.server.appstetic.com`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md cursor-pointer"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Visit Site
                      </a>
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {deployment.status === 'processing' ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 dark:border-blue-400"></div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Capturing preview...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500">
                      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-xs">No preview</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Card Content */}
            <div className="p-4 flex flex-col flex-1 min-h-0">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate mb-1">
                {deployment.site_name}
                {!isDemo && <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">(Owner)</span>}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate mb-3">
                {deployment.subdomain}.server.appstetic.com
              </p>
              
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-4">
                <span>{new Date(deployment.created_at).toLocaleDateString()}</span>
                {deployment.port && (
                  <span className="font-mono">:{deployment.port}</span>
                )}
              </div>
              
              {/* Action Buttons */}
              <div className="space-y-2 mt-auto">
                {/* First row: Visit and Remove */}
                <div className="flex gap-2">
                  {deployment.status === 'running' && deployment.subdomain && (
                    <a
                      href={`https://${deployment.subdomain}.server.appstetic.com`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-md cursor-pointer transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Visit
                    </a>
                  )}
                  <button
                    onClick={() => handleDelete(deployment.id, canManage)}
                    disabled={!canManage}
                    className={`flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      canManage
                        ? 'text-white bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 cursor-pointer'
                        : 'text-gray-400 bg-gray-300 dark:bg-gray-700 dark:text-gray-600 cursor-not-allowed'
                    }`}
                    title={canManage ? 'Remove this demo project' : 'You can only remove your own demo projects'}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Remove
                  </button>
                </div>
                
                {/* Second row: Copy URL and Download */}
                <div className="flex gap-2">
                  {deployment.status === 'running' && deployment.subdomain && (
                    <button
                      onClick={(e) => handleCopyUrl(deployment.subdomain, e)}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600 rounded-md cursor-pointer transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy URL
                    </button>
                  )}
                  {deployment.file_path && (
                    <button
                      onClick={() => handleDownload(deployment.id, canManage, deployment.file_path)}
                      disabled={!canManage}
                      className={`flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                        canManage
                          ? 'text-white bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 cursor-pointer'
                          : 'text-gray-400 bg-gray-300 dark:bg-gray-700 dark:text-gray-600 cursor-not-allowed'
                      }`}
                      title={canManage ? 'Download this demo project' : 'You can only download your own demo projects'}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
