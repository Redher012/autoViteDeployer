'use client';

import { useState } from 'react';
import DemoDeploymentTable from '@/components/DemoDeploymentTable';
import DarkModeToggle from '@/components/DarkModeToggle';

export default function DemoPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadSuccess = () => {
    // Trigger refresh of deployment table
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              Demo Deployment Platform
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Upload and deploy your Vite or Next.js projects. <span className="font-semibold text-yellow-600 dark:text-yellow-400">Demo projects are automatically deleted after 30 minutes.</span>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <DarkModeToggle />
          </div>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-1">Demo Mode Notice</h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-400">
                Projects uploaded here are temporary and will be automatically deleted after 30 minutes. 
                Maximum file size: 50MB. Executable files and path traversal attempts are blocked for security.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8 transition-colors">
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            Upload Project
          </h2>
          <DemoDragDropUpload onUpload={handleUploadSuccess} />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 transition-colors">
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
            Deployed Sites
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            You can view all projects below. Download and Remove buttons are only available for your demo projects.
          </p>
          <DemoDeploymentTable key={refreshKey} />
        </div>
      </div>
    </div>
  );
}

// Demo upload component (similar to DragDropUpload but uses demo endpoint)
function DemoDragDropUpload({ onUpload }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [siteName, setSiteName] = useState('');

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.zip')) {
      await uploadFile(file);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (file && file.name.endsWith('.zip')) {
      await uploadFile(file);
    }
  };

  const uploadFile = async (file) => {
    if (file.size > 50 * 1024 * 1024) {
      alert('File size exceeds 50MB limit');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('siteName', siteName || 'Demo Project');

    try {
      const response = await fetch('/api/demo/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      alert('Upload successful! Your project will be deployed shortly.');
      setSiteName('');
      if (onUpload) onUpload();
    } catch (error) {
      alert(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="siteName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Site Name (optional)
        </label>
        <input
          type="text"
          id="siteName"
          value={siteName}
          onChange={(e) => setSiteName(e.target.value)}
          placeholder="My Demo Project"
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
          dragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50'
        }`}
      >
        <input
          type="file"
          id="file-upload"
          accept=".zip"
          onChange={handleFileSelect}
          className="hidden"
          disabled={uploading}
        />
        <label
          htmlFor="file-upload"
          className="cursor-pointer flex flex-col items-center gap-4"
        >
          <svg
            className="w-16 h-16 text-gray-400 dark:text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <div>
            <span className="text-lg font-medium text-gray-700 dark:text-gray-300">
              {uploading ? 'Uploading...' : 'Drag and drop your ZIP file here'}
            </span>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              or click to browse (Max 50MB)
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}
