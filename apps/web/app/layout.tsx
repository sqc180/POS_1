import type { Metadata } from "next"
import { JetBrains_Mono, Montserrat } from "next/font/google"
import { cn } from "@repo/ui"
import { AppToaster } from "@/components/app-toaster"
import { AuthProvider } from "@/components/auth-provider"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"

const montserrat = Montserrat({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: "POS ERP",
  description: "Multi-business ERP / POS foundation",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(montserrat.variable, jetbrainsMono.variable, "min-h-screen font-sans antialiased")}>
        <ThemeProvider>
          <AuthProvider>
            {children}
            <AppToaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
