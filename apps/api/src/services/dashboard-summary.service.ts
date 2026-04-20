import mongoose from "mongoose"
import { BranchModel } from "../models/branch.model.js"
import { CategoryModel } from "../models/category.model.js"
import { CustomerModel } from "../models/customer.model.js"
import { InventoryItemModel } from "../models/inventory-item.model.js"
import { InvoiceModel } from "../models/invoice.model.js"
import { ProductModel } from "../models/product.model.js"
import { RefundModel } from "../models/refund.model.js"
import { StockBatchModel } from "../models/stock-batch.model.js"
import { SupplierModel } from "../models/supplier.model.js"
import type { DashboardSummaryDTO } from "@repo/types"

export const dashboardSummaryService = {
  async get(tenantId: string): Promise<DashboardSummaryDTO> {
    const tid = new mongoose.Types.ObjectId(tenantId)
    const until = new Date()
    until.setDate(until.getDate() + 60)
    const [
      productsActive,
      categoriesActive,
      branchesActive,
      customersActive,
      suppliersActive,
      inventoryItems,
      draftInvoices,
      completedInvoices,
      pendingRefunds,
      batchesNearExpiry,
    ] = await Promise.all([
      ProductModel.countDocuments({ tenantId: tid, status: "active" }),
      CategoryModel.countDocuments({ tenantId: tid, status: "active" }),
      BranchModel.countDocuments({ tenantId: tid, status: "active" }),
      CustomerModel.countDocuments({ tenantId: tid, status: "active" }),
      SupplierModel.countDocuments({ tenantId: tid, status: "active" }),
      InventoryItemModel.countDocuments({ tenantId: tid }),
      InvoiceModel.countDocuments({ tenantId: tid, status: "draft" }),
      InvoiceModel.countDocuments({ tenantId: tid, status: "completed" }),
      RefundModel.countDocuments({ tenantId: tid, status: "pending" }),
      StockBatchModel.countDocuments({
        tenantId: tid,
        status: "active",
        qtyOnHand: { $gt: 0 },
        expiryDate: { $lte: until, $gte: new Date() },
      }),
    ])
    return {
      productsActive,
      categoriesActive,
      branchesActive,
      customersActive,
      suppliersActive,
      inventoryItems,
      draftInvoices,
      completedInvoices,
      pendingRefunds,
      batchesNearExpiry,
    }
  },
}
