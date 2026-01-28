'use client';

import { useState, useEffect } from 'react';

export default function DeploymentTable() {
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDeployments = async () => {
    try {
      const response = await fetch('/api/deployments');
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

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to remove this deployment?')) {
      return;
    }

    try {
      const response = await fetch(`/api/deployments/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete deployment');
      }

      fetchDeployments();
    } catch (error) {
      alert(`Failed to delete: ${error.message}`);
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {deployments.map((deployment) => (
        <div
          key={deployment.id}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow"
        >
          {/* Screenshot Preview */}
          <div className="relative aspect-video bg-gray-100 dark:bg-gray-900 overflow-hidden group">
            {deployment.screenshot_path ? (
              <>
                <img
                  src={`${deployment.screenshot_path}?v=${deployment.updated_at || Date.now()}`}
                  alt={`Screenshot of ${deployment.site_name}`}
                  className="w-full h-full object-cover object-top"
                />
                {deployment.status === 'running' && (
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex items-center justify-center">
                    <a
                      href={`https://${deployment.subdomain}.server.appstetic.com`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md cursor-pointer"
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
            
            {/* Status Badge Overlay */}
            <div className="absolute top-2 right-2">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium shadow-sm ${getStatusColor(
                  deployment.status
                )}`}
              >
                <span className="mr-1">{getStatusIcon(deployment.status)}</span>
                {deployment.status}
              </span>
            </div>
          </div>

          {/* Card Content */}
          <div className="p-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate mb-1">
              {deployment.site_name}
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
                onClick={() => handleDelete(deployment.id)}
                className={`${deployment.status === 'running' ? 'flex-none' : 'flex-1'} inline-flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 rounded-md cursor-pointer transition-colors`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Remove
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
