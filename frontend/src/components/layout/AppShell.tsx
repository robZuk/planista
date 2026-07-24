import { Outlet, useLocation } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { CommandPalette } from './CommandPalette';
import { ImpersonationBanner } from './ImpersonationBanner';
import { breadcrumbFor } from '@/lib/navigation';

/**
 * Wspolny uklad chronionych widokow.
 *
 * SidebarProvider trzyma stan zwiniecia (zapisuje go w ciasteczku, wiec przezywa
 * odswiezenie) i obsluguje skrot Ctrl+B. SidebarInset to obszar tresci obok panelu.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const crumb = breadcrumbFor(pathname);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Pasek podgladu i naglowek przyklejamy razem — dwa osobne `sticky top-0`
            nachodzilyby na siebie i pasek zaslanialby breadcrumby. */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <ImpersonationBanner />

          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                {crumb && (
                  <>
                    <BreadcrumbItem className="hidden md:block">
                      <span className="text-muted-foreground">{crumb.group}</span>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="hidden md:block" />
                  </>
                )}
                <BreadcrumbItem>
                  <BreadcrumbPage>{crumb?.item.label ?? 'Planista 7'}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="ml-auto">
              <CommandPalette />
            </div>
          </header>
        </div>

        <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
