import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock the apiClient
const mockUploadArchitecturePlan = vi.fn();
const mockGetFileUpload = vi.fn();

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    uploadArchitecturePlan: (...args: unknown[]) => mockUploadArchitecturePlan(...args),
    getFileUpload: (...args: unknown[]) => mockGetFileUpload(...args),
  },
}));

// Mock the auth store
vi.mock('@/lib/stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: { buildingId: string } | null }) => unknown) =>
    selector({ user: { buildingId: 'bld-001' } }),
}));

import ArchitecturePage from '../app/(resident)/architecture/page';

describe('ArchitecturePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadArchitecturePlan.mockReset();
    mockGetFileUpload.mockReset();
  });

  it('renders upload dropzone with expected text', () => {
    render(<ArchitecturePage />);

    // The component uses translation keys as display values
    expect(screen.getByText('title')).toBeInTheDocument();
    expect(screen.getByText('subtitle')).toBeInTheDocument();
    expect(screen.getByText('dropzone.title')).toBeInTheDocument();
    expect(screen.getByText('dropzone.subtitle')).toBeInTheDocument();
    expect(screen.getByText('dropzone.button')).toBeInTheDocument();
    expect(screen.getByText('dropzone.formats')).toBeInTheDocument();
  });

  it('shows analyzing state after file upload', async () => {
    // Upload resolves, then polling starts but never completes (stays pending)
    mockUploadArchitecturePlan.mockResolvedValueOnce({ id: 'file-1' });
    mockGetFileUpload.mockResolvedValue({
      id: 'file-1',
      analysis_status: 'pending',
    });

    render(<ArchitecturePage />);

    // Find the hidden file input and simulate file selection
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    const file = new File(['fake-image-data'], 'floorplan.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('analyzing.title')).toBeInTheDocument();
      expect(screen.getByText('analyzing.subtitle')).toBeInTheDocument();
    });
  });

  it('displays analysis results after successful analysis', async () => {
    const mockAnalysis = {
      rooms_detected: [
        { name: 'Living Room', estimated_sqm: 25 },
        { name: 'Bedroom', estimated_sqm: 15 },
      ],
      total_area_sqm: 80,
      suggestions: [
        {
          category: 'ac_installation',
          confidence: 0.9,
          description_he: 'Install split AC units',
          description_en: 'Install split AC units',
          estimated_sqm: 25,
          estimated_units: 2,
          priority: 'high',
          matching_offers: ['offer-1'],
        },
      ],
      summary_he: 'דירה עם 2 חדרים',
      summary_en: '2 room apartment',
    };

    mockUploadArchitecturePlan.mockResolvedValueOnce({ id: 'file-1' });
    mockGetFileUpload.mockResolvedValueOnce({
      id: 'file-1',
      analysis_status: 'completed',
      analysis_result: mockAnalysis,
    });

    render(<ArchitecturePage />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['fake-image-data'], 'floorplan.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      // Results title and summary
      expect(screen.getByText('results.title')).toBeInTheDocument();
      expect(screen.getByText('דירה עם 2 חדרים')).toBeInTheDocument();
    });

    // Rooms detected
    expect(screen.getByText('Living Room')).toBeInTheDocument();
    expect(screen.getByText('Bedroom')).toBeInTheDocument();

    // Suggestions section
    expect(screen.getByText('results.suggestions')).toBeInTheDocument();
  });

  it('handles upload error gracefully', async () => {
    mockUploadArchitecturePlan.mockRejectedValueOnce(new Error('Upload failed'));

    render(<ArchitecturePage />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['fake-image-data'], 'floorplan.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Upload failed')).toBeInTheDocument();
    });

    // "Try again" button should be visible
    expect(screen.getByText('tryAgain')).toBeInTheDocument();
  });

  it('shows "upload another" button after results are displayed', async () => {
    const mockAnalysis = {
      rooms_detected: [{ name: 'Kitchen', estimated_sqm: 12 }],
      total_area_sqm: 50,
      suggestions: [],
      summary_he: 'דירה קטנה',
      summary_en: 'Small apartment',
    };

    mockUploadArchitecturePlan.mockResolvedValueOnce({ id: 'file-1' });
    mockGetFileUpload.mockResolvedValueOnce({
      id: 'file-1',
      analysis_status: 'completed',
      analysis_result: mockAnalysis,
    });

    render(<ArchitecturePage />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['fake-image-data'], 'floorplan.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('results.title')).toBeInTheDocument();
    });

    // "Upload another" button should be visible
    const uploadAnotherButton = screen.getByText('uploadAnother');
    expect(uploadAnotherButton).toBeInTheDocument();

    // Clicking it should reset to the dropzone
    fireEvent.click(uploadAnotherButton);

    await waitFor(() => {
      expect(screen.getByText('dropzone.title')).toBeInTheDocument();
    });
  });

  it('handles analysis failure from server', async () => {
    mockUploadArchitecturePlan.mockResolvedValueOnce({ id: 'file-1' });
    mockGetFileUpload.mockResolvedValueOnce({
      id: 'file-1',
      analysis_status: 'failed',
    });

    render(<ArchitecturePage />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['fake-image-data'], 'floorplan.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('errors.analysisFailed')).toBeInTheDocument();
    });
  });

  it('supports drag and drop file upload', async () => {
    mockUploadArchitecturePlan.mockResolvedValueOnce({ id: 'file-1' });
    mockGetFileUpload.mockResolvedValue({
      id: 'file-1',
      analysis_status: 'pending',
    });

    render(<ArchitecturePage />);

    const dropzone = screen.getByText('dropzone.title').closest('div[class*="border-dashed"]') ||
      screen.getByText('dropzone.title').parentElement?.parentElement;

    expect(dropzone).toBeTruthy();

    const file = new File(['fake-image-data'], 'floorplan.png', { type: 'image/png' });
    const dataTransfer = {
      files: [file],
      types: ['Files'],
    };

    fireEvent.dragOver(dropzone!, { dataTransfer });
    fireEvent.drop(dropzone!, { dataTransfer });

    await waitFor(() => {
      expect(mockUploadArchitecturePlan).toHaveBeenCalledWith(file, 'bld-001');
    });
  });
});
