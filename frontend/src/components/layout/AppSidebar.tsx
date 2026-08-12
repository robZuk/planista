import { NavLink, useLocation } from 'react-router-dom';
import { CalendarRange } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { NavUser } from './NavUser';
import { useAuthStore } from '@/store/authStore';
import { visibleGroups } from '@/lib/navigation';

/**
 * Lewa nawigacja aplikacji.
 *
 * collapsible="icon" — Ctrl+B zwija panel do samych ikon (tooltipy pokazuja nazwy).
 * Na malych ekranach shadcn sam podmienia panel na wysuwany Sheet.
 */
export function AppSidebar() {
  const role = useAuthStore((s) => s.user?.role);
  const { pathname } = useLocation();
  const groups = visibleGroups(role);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <CalendarRange className="size-4" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-heading font-semibold">Planista</span>
                  <span className="truncate text-xs text-muted-foreground">UMG</span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  // "/" tylko dokladnie, reszta po prefiksie (podstrony planu zostaja podswietlone).
                  const isActive =
                    item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                        <NavLink to={item.to}>
                          <item.icon />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>

      {/* Cienki uchwyt przy krawedzi — zwija/rozwija panel myszka. */}
      <SidebarRail />
    </Sidebar>
  );
}
