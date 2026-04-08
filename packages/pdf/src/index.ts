import PDFDocument from "pdfkit"

export interface PdfLineRow {
  description: string
  qty: number
  rate: number
  tax: number
  total: number
}

export interface InvoicePdfInput {
  tenantName: string
  invoiceNumber: string
  customerName?: string
  subtotal: number
  cgstTotal: number
  sgstTotal: number
  igstTotal: number
  grandTotal: number
  amountPaid: number
  lines: PdfLineRow[]
  footerNote: string
}

export interface ReceiptPdfInput {
  tenantName: string
  receiptNumber: string
  invoiceNumber: string
  amount: number
  method: string
  footerNote: string
}

export interface RefundNotePdfInput {
  tenantName: string
  refundNumber: string
  invoiceNumber: string
  amount: number
  reason?: string
  footerNote: string
}

const bufferFromDoc = (build: (doc: InstanceType<typeof PDFDocument>) => void): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
    try {
      build(doc)
      doc.end()
    } catch (e) {
      reject(e)
    }
  })

export const renderInvoicePdf = async (input: InvoicePdfInput): Promise<Buffer> =>
  bufferFromDoc((doc) => {
    doc.fontSize(18).text(input.tenantName, { align: "center" })
    doc.moveDown(0.5)
    doc.fontSize(14).text(`Tax Invoice — ${input.invoiceNumber}`, { align: "center" })
    doc.moveDown()
    doc.fontSize(10)
    if (input.customerName) doc.text(`Customer: ${input.customerName}`)
    doc.moveDown()
    doc.text("Items", { underline: true })
    doc.moveDown(0.25)
    input.lines.forEach((row) => {
      doc.text(
        `${row.description}  |  Qty ${row.qty}  @ ${row.rate.toFixed(2)}  |  Tax ${row.tax.toFixed(2)}  |  ${row.total.toFixed(2)}`,
      )
    })
    doc.moveDown()
    doc.text(`Subtotal (taxable): ${input.subtotal.toFixed(2)}`)
    doc.text(`CGST: ${input.cgstTotal.toFixed(2)}  SGST: ${input.sgstTotal.toFixed(2)}  IGST: ${input.igstTotal.toFixed(2)}`)
    doc.fontSize(12).text(`Grand total: ₹${input.grandTotal.toFixed(2)}`, { continued: false })
    doc.fontSize(10).text(`Amount paid: ₹${input.amountPaid.toFixed(2)}`)
    doc.moveDown()
    doc.fontSize(9).fillColor("#444").text(input.footerNote, { align: "center" })
  })

export const renderReceiptPdf = async (input: ReceiptPdfInput): Promise<Buffer> =>
  bufferFromDoc((doc) => {
    doc.fontSize(18).text(input.tenantName, { align: "center" })
    doc.moveDown()
    doc.fontSize(14).text(`Receipt ${input.receiptNumber}`, { align: "center" })
    doc.moveDown()
    doc.fontSize(11)
    doc.text(`Invoice: ${input.invoiceNumber}`)
    doc.text(`Amount: ₹${input.amount.toFixed(2)}`)
    doc.text(`Method: ${input.method}`)
    doc.moveDown()
    doc.fontSize(9).fillColor("#444").text(input.footerNote, { align: "center" })
  })

export const renderRefundNotePdf = async (input: RefundNotePdfInput): Promise<Buffer> =>
  bufferFromDoc((doc) => {
    doc.fontSize(18).text(input.tenantName, { align: "center" })
    doc.moveDown()
    doc.fontSize(14).text(`Refund note ${input.refundNumber}`, { align: "center" })
    doc.moveDown()
    doc.fontSize(11)
    doc.text(`Invoice: ${input.invoiceNumber}`)
    doc.text(`Refund amount: ₹${input.amount.toFixed(2)}`)
    if (input.reason) doc.text(`Reason: ${input.reason}`)
    doc.moveDown()
    doc.fontSize(9).fillColor("#444").text(input.footerNote, { align: "center" })
  })
