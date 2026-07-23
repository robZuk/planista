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
        {/* sticky, zeby przy dlugich tabelach naglowek z breadcrumbami zostawal na wierzchu */}
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
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
        </header>

        <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
