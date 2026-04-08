import { Card, CardContent, CardHeader, Skeleton } from "@repo/ui"

export const DocumentsLoadingFallback = () => (
  <div className="space-y-6 p-4 sm:p-6">
    <div className="space-y-2">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-full max-w-xl" />
    </div>
    <Card className="border-border/80 shadow-elevate-sm">
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-[min(60vh,28rem)] w-full rounded-lg" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-32" />
        </div>
      </CardContent>
    </Card>
  </div>
)
