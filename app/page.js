'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DragDropUpload from '@/components/DragDropUpload';
import DeploymentTable from '@/components/DeploymentTable';
import DarkModeToggle from '@/components/DarkModeToggle';

export default function Home() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/check');
      const data = await res.json();
      if (data.authenticated) {
        setAuthenticated(true);
      } else {
        router.push('/login');
      }
    } catch (err) {
      console.error('Auth check failed:', err);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleUploadSuccess = () => {
    // Trigger refresh of deployment table
    setRefreshKey((prev) => prev + 1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              Vite Deployment Platform
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Upload and deploy your Vite projects with automatic subdomain routing
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Logout
            </button>
            <DarkModeToggle />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8 transition-colors">
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            Upload Project
          </h2>
          <DragDropUpload onUpload={handleUploadSuccess} />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 transition-colors">
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            Deployed Sites
          </h2>
          <DeploymentTable key={refreshKey} />
        </div>
      </div>
    </div>
  );
}
