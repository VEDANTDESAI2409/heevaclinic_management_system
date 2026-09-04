// ─── HEEVA CLINIC — A4 payment receipt print engine ─────────────────────────
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { registerPrinter } from '../print/printers';

const Ctx = createContext(null);
export const usePrint = () => useContext(Ctx);

export function PrintProvider({ children }) {
  const [job, setJob] = useState(null);

  const print = useCallback((node) => setJob({ node, id: Date.now() }), []);

  // Allow non-component modules (services, print helpers) to trigger printing
  useEffect(() => {
    registerPrinter(print);
    return () => registerPrinter(null);
  }, [print]);

  useEffect(() => {
    if (!job) return undefined;
    const timer = setTimeout(() => {
      try { window.print(); } catch (e) { /* ignore */ }
    }, 200);
    const after = () => setJob(null);
    window.addEventListener('afterprint', after);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', after);
    };
  }, [job]);

  return (
    <Ctx.Provider value={{ print, printing: !!job }}>
      {children}
      <div id="print-root">{job ? job.node : null}</div>
    </Ctx.Provider>
  );
}
