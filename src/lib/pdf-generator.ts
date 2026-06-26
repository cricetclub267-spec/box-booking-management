import type jsPDF from 'jspdf';
import { Booking, Payment } from './db/types';
import { supabase, hasSupabaseCredentials } from './db/supabase';
import * as mockDb from './db/mock-db';

const useSupabase = (): boolean => {
  return hasSupabaseCredentials() && supabase !== null;
};

const formatPhone = (phone?: string): string => {
  if (!phone) return 'N/A';
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    cleaned = cleaned.substring(1);
  }
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    cleaned = cleaned.substring(2);
  }
  return cleaned;
};

// Helper to asynchronously load the brand logo image in the browser
const loadLogoImage = (): Promise<HTMLImageElement> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = '/logo.png';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null as any); // Fall back gracefully if image fails to load
  });
};

// Premium styling theme colours
const PRIMARY_GREEN: [number, number, number] = [12, 74, 40]; // Deep Forest Green (#0C4A28)
const ALT_ROW_TINT: [number, number, number] = [245, 248, 246]; // Very light green-grey tint for clean alternate rows
const TEXT_DARK: [number, number, number] = [60, 60, 60];
const BORDER_LIGHT: [number, number, number] = [220, 220, 220];

// Business details helper
const addPDFHeader = (doc: jsPDF, title: string, logoImg?: HTMLImageElement | null) => {
  // Brand Header Band
  doc.setFillColor(12, 74, 40); 
  doc.rect(0, 0, 210, 32, 'F');
  
  if (logoImg) {
    // Render logo on the left of the header
    doc.addImage(logoImg, 'PNG', 14, 5, 22, 22); 
    
    // Brand title aligned next to logo
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('360 CLUB BOX', 40, 16);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Premium Turf Booking & Management Dashboard', 40, 22);
  } else {
    // Text-only fallback branding
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('360 CLUB BOX', 14, 17);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Premium Turf Booking & Management Dashboard', 14, 23);
  }
  
  // Title & Metadata
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 43);
  
  const now = new Date();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generated on: ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}`, 135, 43);
  
  // Divider line
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.5);
  doc.line(14, 47, 196, 47);
};

const addPDFFooter = (doc: jsPDF) => {
  const pageCount = (doc as any).internal.getNumberOfPages();
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.text(
      'Thank you for using 360 Club Box Booking Management. System generated copy.',
      14,
      287
    );
    doc.text(`Page ${i} of ${pageCount}`, 180, 287);
  }
};

// 1. Generate Invoice Receipt for Single Booking
export const exportBookingReceiptPDF = async (
  booking: Booking,
  paymentSummary: { totalPaid: number; pendingAmount: number; status: string }
) => {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const logoImg = await loadLogoImage();
  addPDFHeader(doc, 'BOOKING INVOICE RECEIPT', logoImg);

  // Load payments for this booking
  let bookingPayments: Payment[] = [];
  if (useSupabase() && supabase) {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('booking_id', booking.id);
      if (!error && data) {
        bookingPayments = data;
      }
    } catch (e) {
      console.error('Failed to load payments for PDF:', e);
    }
  } else {
    bookingPayments = mockDb.getPayments().filter((p: any) => p.booking_id === booking.id);
  }

  // Calculate payment type breakdown
  const cashPayments = bookingPayments.filter((p: any) => p.payment_method === 'Cash');
  const upiPayments = bookingPayments.filter((p: any) => p.payment_method === 'UPI');
  const cardPayments = bookingPayments.filter((p: any) => p.payment_method === 'Card');
  const bankPayments = bookingPayments.filter((p: any) => p.payment_method === 'Bank Transfer');

  const cashTotal = cashPayments.reduce((sum, p) => sum + Number(p.amount_paid), 0);
  const upiTotal = upiPayments.reduce((sum, p) => sum + Number(p.amount_paid), 0);
  const cardTotal = cardPayments.reduce((sum, p) => sum + Number(p.amount_paid), 0);
  const bankTotal = bankPayments.reduce((sum, p) => sum + Number(p.amount_paid), 0);

  let paymentTypeStr = 'None';
  if (bookingPayments.length > 0) {
    const activeMethods = [];
    if (cashTotal > 0) activeMethods.push(`Cash: ₹${cashTotal}`);
    if (upiTotal > 0) activeMethods.push(`UPI: ₹${upiTotal}`);
    if (cardTotal > 0) activeMethods.push(`Card: ₹${cardTotal}`);
    if (bankTotal > 0) activeMethods.push(`Bank: ₹${bankTotal}`);

    if (activeMethods.length > 1) {
      paymentTypeStr = `Split (${activeMethods.join(', ')})`;
    } else {
      const singleMethod = bookingPayments[0].payment_method;
      paymentTypeStr = `${singleMethod} (₹${paymentSummary.totalPaid})`;
    }
  }

  // Customer & Booking Metadata Info Box
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(12, 74, 40);
  doc.text('CUSTOMER DETAILS', 14, 56);
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(50, 50, 50);
  doc.text(`Name: ${booking.customer?.name || 'Walk-in'}`, 14, 62);
  doc.text(`Phone: ${formatPhone(booking.customer?.phone)}`, 14, 67);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(12, 74, 40);
  doc.text('BOOKING DETAILS', 120, 56);
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(50, 50, 50);
  doc.text(`Invoice ID: ${booking.id}`, 120, 62);
  doc.text(`Scheduled Date: ${new Date(booking.booking_date).toLocaleDateString()}`, 120, 67);
  doc.text(`Scheduled Slot: ${booking.start_time} - ${booking.end_time}`, 120, 72);
  doc.text(`Turf Ground: ${booking.ground?.name || 'Turf'}`, 120, 77);

  // Table showing Billing Breakdown
  const hours = Number(booking.amount) / (booking.ground?.hourly_rate || 1200);
  
  autoTable(doc, {
    startY: 85,
    head: [['Item Description', 'Unit Cost (₹/hr)', 'Duration (hrs)', 'Total Base (₹)']],
    body: [[
      `Turf rental for ${booking.ground?.name || 'Ground'}`,
      `₹${booking.ground?.hourly_rate || 1200}`,
      `${hours.toFixed(1)} hrs`,
      `₹${booking.amount}`
    ]],
    headStyles: { 
      fillColor: PRIMARY_GREEN, 
      textColor: [255, 255, 255], 
      fontStyle: 'bold', 
      halign: 'center' 
    },
    bodyStyles: { textColor: TEXT_DARK, fontSize: 9 },
    theme: 'grid',
    styles: { 
      cellPadding: 3.5, 
      lineColor: BORDER_LIGHT, 
      lineWidth: 0.1,
      halign: 'center'
    }
  });

  // Calculate totals block position
  let finalY = (doc as any).lastAutoTable.finalY + 10;

  // Add notes if present
  if (booking.notes) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    doc.text('Notes / Instructions:', 14, finalY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(booking.notes, 14, finalY + 5);
  }

  // Totals Breakdown
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text('Base Price:', 130, finalY);
  doc.text(`₹${booking.amount}`, 180, finalY, { align: 'right' });

  doc.text('Applied Discount:', 130, finalY + 5);
  doc.text(`- ₹${booking.discount}`, 180, finalY + 5, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(12, 74, 40);
  doc.text('Net Final Bill:', 130, finalY + 10);
  doc.text(`₹${booking.final_amount}`, 180, finalY + 10, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text('Payment Type:', 130, finalY + 15);
  doc.text(paymentTypeStr, 180, finalY + 15, { align: 'right' });

  doc.setTextColor(60, 60, 60);
  doc.text('Total Collected:', 130, finalY + 20);
  doc.text(`₹${paymentSummary.totalPaid}`, 180, finalY + 20, { align: 'right' });

  doc.setTextColor(180, 50, 50);
  doc.text('Remaining Balance:', 130, finalY + 25);
  doc.text(`₹${paymentSummary.pendingAmount}`, 180, finalY + 25, { align: 'right' });

  addPDFFooter(doc);
  
  const customerCleanName = (booking.customer?.name || 'walk-in').replace(/\s+/g, '_');
  doc.save(`booking_receipt_${customerCleanName}_${booking.id}.pdf`);
};

// 2. Generate Revenue Report PDF
export const exportRevenueReportPDF = async (
  bookingsList: Booking[],
  paymentSummaries: Record<string, { totalPaid: number; pendingAmount: number; status: string }>,
  dateRange: string,
  paymentsList: Payment[] = []
) => {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF();
  const logoImg = await loadLogoImage();
  addPDFHeader(doc, `REVENUE REPORT SUMMARY`, logoImg);

  // Summarize list totals
  const totalRevenue = bookingsList.reduce((sum, b) => sum + Number(b.final_amount), 0);
  const totalCollected = bookingsList.reduce((sum, b) => {
    const summary = paymentSummaries[b.id];
    return sum + (summary ? summary.totalPaid : 0);
  }, 0);
  const totalDiscounts = bookingsList.reduce((sum, b) => sum + Number(b.discount), 0);
  const totalDues = bookingsList.reduce((sum, b) => {
    const summary = paymentSummaries[b.id];
    return sum + (summary ? summary.pendingAmount : 0);
  }, 0);

  // Summary Metrics boxes
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(12, 74, 40);
  doc.text(`DATE RANGE PERIOD: ${dateRange}`, 14, 54);

  autoTable(doc, {
    startY: 58,
    head: [['Billable Amount (₹)', 'Discounts Given (₹)', 'Revenue Collected (₹)', 'Outstanding Balances (₹)']],
    body: [[
      `₹${totalRevenue.toLocaleString()}`,
      `₹${totalDiscounts.toLocaleString()}`,
      `₹${totalCollected.toLocaleString()}`,
      `₹${totalDues.toLocaleString()}`
    ]],
    headStyles: { 
      fillColor: [80, 80, 80], 
      textColor: [255, 255, 255], 
      fontStyle: 'bold', 
      halign: 'center' 
    },
    bodyStyles: { textColor: TEXT_DARK, fontSize: 9, fontStyle: 'bold' },
    theme: 'grid',
    styles: { halign: 'center', cellPadding: 3.5, lineColor: BORDER_LIGHT, lineWidth: 0.1 }
  });

  const tableBody = bookingsList.map(b => {
    const summary = paymentSummaries[b.id];
    const bookingPayments = paymentsList.filter(p => p.booking_id === b.id);
    const paymentBreakdown = bookingPayments.map(p => `${p.payment_method}: ₹${p.amount_paid}`).join(', ');
    const paidText = summary && summary.totalPaid > 0
      ? `₹${summary.totalPaid}\n(${paymentBreakdown})`
      : '₹0';

    return [
      b.id.substring(0, 8),
      new Date(b.booking_date).toLocaleDateString(),
      b.customer?.name || 'Walk-in',
      b.ground?.name.split(' (')[0] || 'Ground',
      `₹${b.final_amount}`,
      paidText,
      `₹${summary ? summary.pendingAmount : 0}`,
      summary?.status || 'Pending'
    ];
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 10,
    head: [['Ref ID', 'Date', 'Customer', 'Ground', 'Final Bill', 'Paid', 'Dues', 'Status']],
    body: tableBody,
    headStyles: { 
      fillColor: PRIMARY_GREEN, 
      textColor: [255, 255, 255], 
      fontStyle: 'bold', 
      halign: 'center' 
    },
    bodyStyles: { textColor: TEXT_DARK, fontSize: 8 },
    alternateRowStyles: { fillColor: ALT_ROW_TINT },
    theme: 'striped',
    styles: { cellPadding: 3, lineColor: BORDER_LIGHT, lineWidth: 0.1 }
  });

  addPDFFooter(doc);
  const rangeSlug = dateRange.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  doc.save(`revenue_report_${rangeSlug}.pdf`);
};

// 3. Generate Payments Report PDF
export const exportPaymentsReportPDF = async (
  paymentsList: Payment[],
  bookingsList: Booking[],
  dateRange: string
) => {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF();
  const logoImg = await loadLogoImage();
  addPDFHeader(doc, `TRANSACTION RECEIPTS REPORT`, logoImg);

  const totalCollected = paymentsList.reduce((sum, p) => sum + Number(p.amount_paid), 0);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(12, 74, 40);
  doc.text(`DATE RANGE PERIOD: ${dateRange}`, 14, 54);
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(50, 50, 50);
  doc.text(`Total Transactions Count: ${paymentsList.length}`, 14, 60);
  doc.text(`Total Volume Collected: ₹${totalCollected.toLocaleString('en-IN')}`, 14, 65);

  const tableBody = paymentsList.map(p => {
    const booking = bookingsList.find(b => b.id === p.booking_id);
    return [
      p.id.substring(0, 8),
      p.booking_id.substring(0, 8),
      booking?.customer?.name || 'Customer',
      new Date(p.payment_date).toLocaleDateString(),
      p.payment_method,
      `₹${p.amount_paid}`
    ];
  });

  autoTable(doc, {
    startY: 72,
    head: [['Receipt ID', 'Booking ID', 'Customer', 'Payment Date', 'Method', 'Amount']],
    body: tableBody,
    headStyles: { 
      fillColor: PRIMARY_GREEN, 
      textColor: [255, 255, 255], 
      fontStyle: 'bold', 
      halign: 'center' 
    },
    bodyStyles: { textColor: TEXT_DARK, fontSize: 8 },
    alternateRowStyles: { fillColor: ALT_ROW_TINT },
    theme: 'striped',
    styles: { cellPadding: 3, lineColor: BORDER_LIGHT, lineWidth: 0.1 }
  });

  addPDFFooter(doc);
  const rangeSlug = dateRange.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  doc.save(`payments_report_${rangeSlug}.pdf`);
};

// 4. Generate Discount Report PDF
export const exportDiscountReportPDF = async (
  bookingsList: Booking[],
  dateRange: string
) => {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF();
  const logoImg = await loadLogoImage();
  addPDFHeader(doc, `DISCOUNT AUDITING REPORT`, logoImg);

  const discountedBookings = bookingsList.filter(b => Number(b.discount) > 0);
  const totalDiscounts = discountedBookings.reduce((sum, b) => sum + Number(b.discount), 0);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(12, 74, 40);
  doc.text(`DATE RANGE PERIOD: ${dateRange}`, 14, 54);
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(50, 50, 50);
  doc.text(`Total Discounted Bookings: ${discountedBookings.length}`, 14, 60);
  doc.text(`Total Discount Sum: ₹${totalDiscounts.toLocaleString('en-IN')}`, 14, 65);

  const tableBody = discountedBookings.map(b => [
    b.id.substring(0, 8),
    new Date(b.booking_date).toLocaleDateString(),
    b.customer?.name || 'Customer',
    formatPhone(b.customer?.phone),
    `₹${b.amount}`,
    `₹${b.discount}`,
    b.notes || 'Regular Discount'
  ]);

  autoTable(doc, {
    startY: 72,
    head: [['Booking ID', 'Date', 'Customer Name', 'Phone', 'Base Price', 'Discount Given', 'Reason / Notes']],
    body: tableBody,
    headStyles: { 
      fillColor: PRIMARY_GREEN, 
      textColor: [255, 255, 255], 
      fontStyle: 'bold', 
      halign: 'center' 
    },
    bodyStyles: { textColor: TEXT_DARK, fontSize: 8 },
    alternateRowStyles: { fillColor: ALT_ROW_TINT },
    theme: 'striped',
    styles: { cellPadding: 3, lineColor: BORDER_LIGHT, lineWidth: 0.1 }
  });

  addPDFFooter(doc);
  const rangeSlug = dateRange.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  doc.save(`discount_report_${rangeSlug}.pdf`);
};
