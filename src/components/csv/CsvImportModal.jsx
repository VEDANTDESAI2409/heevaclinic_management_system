import React, { useState, useRef, useEffect } from 'react';
import { Modal, Btn, Badge, DataTable, Tabs } from '../ui';
import { useApp } from '../../context/AppContext';
import db from '../../db';
import { parseCSV } from '../../utils/csvParser';
import { CSV_TEMPLATES, downloadTemplate } from '../../utils/csvTemplates';
import { validateCSVRows } from '../../utils/csvValidation';
import { bulkImportRecords } from '../../services/api';
import { Upload, Download, FileSpreadsheet, AlertTriangle, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

const TABLE_MAP = {
  patients: { endpoint: 'patients', dexie: 'patients' },
  medicines: { endpoint: 'medicines', dexie: 'medicines' },
  medicine_categories: { endpoint: 'medicine_categories', dexie: 'medicine_categories' },
  doctors: { endpoint: 'doctors', dexie: 'doctors' },
  inventory_batches: { endpoint: 'medicine_batches', dexie: 'batches' },
};

export default function CsvImportModal({
  open,
  onClose,
  type = 'patients',
  context = {},
  onSuccess,
}) {
  const { user, pushToast } = useApp();
  const template = CSV_TEMPLATES[type] || CSV_TEMPLATES.patients;
  const fileInputRef = useRef(null);

  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState(null);

  // Reset state on modal open/close or type change
  useEffect(() => {
    if (open) {
      setFile(null);
      setParseError(null);
      setValidationResult(null);
      setActiveTab('all');
      setBusy(false);
      setServerError(null);
      setDragActive(false);
    }
  }, [open, type]);

  const handleFileProcess = async (selectedFile) => {
    if (!selectedFile) return;
    if (!selectedFile.name.toLowerCase().endsWith('.csv') && selectedFile.type !== 'text/csv') {
      setParseError('Please upload a valid CSV (.csv) file.');
      return;
    }

    setFile(selectedFile);
    setParseError(null);
    setServerError(null);
    setValidationResult(null);

    try {
      const text = await selectedFile.text();
      const parsed = parseCSV(text);

      if (parsed.errors && parsed.errors.length > 0) {
        setParseError(parsed.errors.join('; '));
        return;
      }

      if (!parsed.rows || parsed.rows.length === 0) {
        setParseError('No data rows found in CSV file.');
        return;
      }

      const res = validateCSVRows(type, parsed.rows, context);
      setValidationResult(res);

      if (res.summary.validCount === 0 && res.summary.invalidCount > 0) {
        setActiveTab('errors');
      } else {
        setActiveTab('all');
      }
    } catch (err) {
      console.error('[CSV Import] parse error:', err);
      setParseError(err.message || 'Failed to process CSV file.');
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileProcess(e.target.files[0]);
    }
  };

  const resetFile = () => {
    setFile(null);
    setParseError(null);
    setValidationResult(null);
    setServerError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImport = async () => {
    if (!validationResult || validationResult.summary.validCount === 0) return;

    setBusy(true);
    setServerError(null);

    const mapping = TABLE_MAP[type] || { endpoint: type, dexie: type };

    try {
      const result = await bulkImportRecords(mapping.endpoint, validationResult.validRows, user?.id);

      // Hydrate local Dexie cache without triggering redundant network PUT requests
      db.__hydrating = true;
      try {
        if (db[mapping.dexie] && Array.isArray(result.records)) {
          await db[mapping.dexie].bulkPut(result.records);
        }
        if (result.extraTables) {
          for (const [t, items] of Object.entries(result.extraTables)) {
            if (db[t] && Array.isArray(items)) {
              await db[t].bulkPut(items);
            }
          }
        }
      } finally {
        db.__hydrating = false;
      }

      const importedMsg = `Imported ${result.count} ${template.title.toLowerCase()}${
        result.skipped ? ` (${result.skipped} row(s) skipped)` : ''
      }`;
      pushToast('success', importedMsg);

      if (onSuccess) {
        onSuccess(result);
      }
      onClose();
    } catch (err) {
      console.error('[CSV Import] execution error:', err);
      setServerError(err.message || 'Failed to complete import.');
    } finally {
      setBusy(false);
    }
  };

  // Preview table column definitions dynamically matching template
  const previewColumns = [
    {
      key: '__rowNum',
      label: 'Row',
      render: (r) => <span style={{ fontFamily: 'monospace', color: 'var(--text-3)' }}>#{r.__rowNum}</span>,
    },
    ...template.columns.map((col) => ({
      key: col.key,
      label: col.label,
      render: (r) => {
        const val = r[col.key];
        return val != null && val !== '' ? String(val) : <span style={{ color: 'var(--text-3)' }}>—</span>;
      },
    })),
    {
      key: '__status',
      label: 'Status',
      render: (r) => {
        const errObj = validationResult?.invalidRows.find((x) => x.rowNum === r.__rowNum);
        if (errObj) {
          return (
            <Badge tone="red" title={errObj.errors.join('; ')}>
              <XCircle size={12} /> {errObj.errors[0]}
            </Badge>
          );
        }
        return (
          <Badge tone="green">
            <CheckCircle2 size={12} /> Ready
          </Badge>
        );
      },
    },
  ];

  // Combined rows for 'all' preview tab
  const allRowsCombined = React.useMemo(() => {
    if (!validationResult) return [];
    const valid = validationResult.validRows || [];
    const invalid = (validationResult.invalidRows || []).map((x) => ({ ...x.row, __rowNum: x.rowNum }));
    return [...valid, ...invalid].sort((a, b) => a.__rowNum - b.__rowNum);
  }, [validationResult]);

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={`Import ${template.title} from CSV`}
      sub="Upload RFC-4180 compliant CSV files with live preview, row validation, and error reporting."
      width="xl"
      footer={
        <>
          {file && (
            <Btn variant="ghost" onClick={resetFile} disabled={busy} style={{ marginRight: 'auto' }}>
              <RefreshCw size={14} /> Select Different File
            </Btn>
          )}
          <Btn variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn
            variant="accent"
            onClick={handleImport}
            disabled={!validationResult || validationResult.summary.validCount === 0 || busy}
          >
            {busy
              ? 'Importing…'
              : validationResult
              ? `Import ${validationResult.summary.validCount} Valid Record${validationResult.summary.validCount === 1 ? '' : 's'}`
              : 'Import Records'}
          </Btn>
        </>
      }
    >
      {/* Template download and guidance header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          background: 'var(--surface-2)',
          padding: '12px 16px',
          borderRadius: '10px',
          marginBottom: '16px',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ flex: 1, minWidth: '220px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
            Need the correct spreadsheet format?
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '2px' }}>
            Download the official CSV template with example data and field headers.
          </div>
        </div>
        <Btn
          size="sm"
          variant="outline"
          icon={Download}
          onClick={() => downloadTemplate(type)}
        >
          Download {template.title} Template
        </Btn>
      </div>

      {serverError && (
        <div className="form-alert" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={16} /> {serverError}
        </div>
      )}

      {/* No file selected state: Drag & Drop Zone */}
      {!file && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <div
            className="import-drop"
            style={{
              borderColor: dragActive ? 'var(--teal-500)' : undefined,
              backgroundColor: dragActive ? 'var(--teal-50)' : undefined,
              cursor: 'pointer',
              padding: '40px 20px',
              textAlign: 'center',
            }}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={36} style={{ color: 'var(--teal-600)', marginBottom: '4px' }} />
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
              Click to select or drag and drop your CSV file here
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-3)' }}>
              Standard UTF-8 or ANSI encoded .csv files are supported.
            </div>
          </div>

          {/* Expected Fields Breakdown */}
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              Expected CSV Columns:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {template.columns.map((col) => (
                <Badge
                  key={col.key}
                  tone={col.required ? 'teal' : 'gray'}
                  title={col.required ? 'Mandatory column' : 'Optional column'}
                >
                  {col.key} {col.required ? '*(required)' : ''}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Parsing error state */}
      {file && parseError && (
        <div style={{ textAlign: 'center', padding: '24px 16px' }}>
          <div className="form-alert" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} /> {parseError}
          </div>
          <div style={{ marginTop: '12px' }}>
            <Btn variant="outline" size="sm" onClick={resetFile}>
              Choose Another CSV File
            </Btn>
          </div>
        </div>
      )}

      {/* Validation & Preview State */}
      {file && validationResult && (
        <div>
          {/* File summary and metrics bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
              padding: '10px 14px',
              background: 'var(--surface-2)',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              marginBottom: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileSpreadsheet size={18} style={{ color: 'var(--teal-600)' }} />
              <div>
                <span style={{ fontWeight: 650, fontSize: '13.5px' }}>{file.name}</span>
                <span style={{ fontSize: '11.5px', color: 'var(--text-3)', marginLeft: '8px' }}>
                  ({Math.round(file.size / 1024)} KB)
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Badge tone="gray">Total: {validationResult.summary.total}</Badge>
              <Badge tone="green">Ready: {validationResult.summary.validCount}</Badge>
              {validationResult.summary.invalidCount > 0 && (
                <Badge tone="red">Errors: {validationResult.summary.invalidCount}</Badge>
              )}
            </div>
          </div>

          {/* Partial Import Advisory */}
          {validationResult.summary.invalidCount > 0 && validationResult.summary.validCount > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--amber-bg)',
                color: 'var(--amber)',
                border: '1px solid #d9770633',
                borderRadius: '8px',
                padding: '9px 12px',
                fontSize: '12.5px',
                fontWeight: 600,
                marginBottom: '14px',
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span>
                Partial import enabled: <strong>{validationResult.summary.validCount} valid record(s)</strong> will be imported, while{' '}
                <strong>{validationResult.summary.invalidCount} invalid row(s)</strong> will be safely skipped.
              </span>
            </div>
          )}

          {/* All records invalid warning */}
          {validationResult.summary.validCount === 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--red-bg)',
                color: 'var(--red)',
                borderRadius: '8px',
                padding: '9px 12px',
                fontSize: '12.5px',
                fontWeight: 600,
                marginBottom: '14px',
              }}
            >
              <XCircle size={16} style={{ flexShrink: 0 }} />
              <span>
                All {validationResult.summary.invalidCount} row(s) contain validation errors. Please review the errors tab below, fix your CSV file, and try again.
              </span>
            </div>
          )}

          {/* Filter Tabs */}
          <Tabs
            active={activeTab}
            onChange={setActiveTab}
            tabs={[
              { key: 'all', label: 'All Rows', badge: validationResult.summary.total },
              { key: 'ready', label: 'Ready to Import', badge: validationResult.summary.validCount },
              { key: 'errors', label: 'Errors to Fix', badge: validationResult.summary.invalidCount },
            ]}
          />

          {/* Tab 1: All Rows */}
          {activeTab === 'all' && (
            <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
              <DataTable
                dense
                columns={previewColumns}
                rows={allRowsCombined}
                pageSize={10}
                rowKey="__rowNum"
              />
            </div>
          )}

          {/* Tab 2: Ready Rows */}
          {activeTab === 'ready' && (
            <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
              <DataTable
                dense
                columns={previewColumns.filter((c) => c.key !== '__status')}
                rows={validationResult.validRows}
                pageSize={10}
                rowKey="__rowNum"
                empty={<div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-3)' }}>No valid rows ready for import.</div>}
              />
            </div>
          )}

          {/* Tab 3: Errors */}
          {activeTab === 'errors' && (
            <div style={{ maxHeight: '360px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {validationResult.invalidRows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--green)', fontWeight: 600 }}>
                  <CheckCircle2 size={24} style={{ display: 'inline-block', marginBottom: '6px' }} />
                  <div>All rows passed validation! Zero errors found.</div>
                </div>
              ) : (
                validationResult.invalidRows.map(({ rowNum, errors, row }) => (
                  <div
                    key={rowNum}
                    style={{
                      border: '1px solid var(--border)',
                      borderLeft: '4px solid var(--red)',
                      background: 'var(--surface-2)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--red)' }}>
                        CSV Line #{rowNum}
                      </span>
                      <span style={{ fontSize: '11.5px', color: 'var(--text-3)' }}>
                        {row.name ? `"${row.name}"` : row.medicine_name ? `"${row.medicine_name}"` : ''}
                      </span>
                    </div>
                    <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: '12px', color: 'var(--text)' }}>
                      {errors.map((err, i) => (
                        <li key={i} style={{ color: 'var(--red)', marginBottom: '2px' }}>
                          {err}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
