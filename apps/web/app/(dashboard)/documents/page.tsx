import { Suspense } from "react"
import { DocumentsClient } from "./documents-client"
import { DocumentsLoadingFallback } from "./loading-fallback"

export default function DocumentsPage() {
  return (
    <Suspense fallback={<DocumentsLoadingFallback />}>
      <DocumentsClient />
    </Suspense>
  )
}
