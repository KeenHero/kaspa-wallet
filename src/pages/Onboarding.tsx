import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'

export default function Onboarding() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center"
      >
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-500/30 animate-pulse">
          <span className="text-white font-bold text-4xl">K</span>
        </div>
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
      </motion.div>
    </div>
  )
}
