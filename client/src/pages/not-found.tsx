import { Link } from "wouter";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSeo } from "@/lib/seo";

export default function NotFound() {
  useSeo({ title: "Not Found", description: "Page not found.", path: window.location.pathname });
  return (
    <div className="min-h-screen">
      <Navigation />
      <div className="pt-24 sm:pt-28 pb-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="glass max-w-xl mx-auto">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-white">
                  <AlertTriangle className="h-5 w-5 text-neon-gold" /> Page not found
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-white/70">
                  That page doesn’t exist (or has moved). Use the button below to get back to the site.
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <Link href="/">
                    <Button className="font-display bg-gradient-to-r from-neon-purple to-neon-gold hover:opacity-90" data-testid="button-back-home">
                      <ArrowLeft className="h-4 w-4 mr-2" /> Back to Home
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
