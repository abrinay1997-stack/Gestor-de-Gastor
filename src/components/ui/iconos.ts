/**
 * Registro explicito de iconos.
 *
 * Antes esto era `import * as Icons from 'lucide-react'` con busqueda dinamica
 * por nombre. Comodo de escribir, pero le impide al empaquetador saber cuales
 * se usan: terminaba incluyendo las ~1.500 del paquete y el bundle principal
 * pesaba 1,16 MB.
 *
 * Con el registro explicito solo entran estas. Agregar un icono nuevo es
 * sumar una linea aca; si alguien usa un nombre que no esta, cae en el
 * generico en vez de romper la pantalla.
 */

import {
  Archive, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Banknote, Briefcase,
  Car, ChartPie, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle,
  CircleCheck, CircleEllipsis, CircleHelp, CirclePlus, CloudOff, CreditCard,
  Download, FileMinus, Gift, GraduationCap, HandCoins, HeartHandshake,
  HeartPulse, House, Landmark, Laptop, Lock, LogOut, PartyPopper, PawPrint,
  PiggyBank, Plus, Popcorn, ReceiptText, SearchX, Settings, Settings2,
  ShoppingBag, Split, Tag, Tags, Trash2, TrendingUp, TriangleAlert, UserPlus,
  Pencil, Repeat, Calendar, CalendarDays, GripVertical, Bell, Eye, Filter,
  ChartColumn, Sparkles, Users, Palette, Trash, Check, ArrowLeft,
  Utensils, Wallet, WandSparkles, X, Zap,
  type LucideIcon,
} from 'lucide-react';

export const ICONOS: Record<string, LucideIcon> = {
  'archive': Archive,
  'arrow-down-left': ArrowDownLeft,
  'arrow-left-right': ArrowLeftRight,
  'arrow-up-right': ArrowUpRight,
  'banknote': Banknote,
  'briefcase': Briefcase,
  'car': Car,
  'chart-pie': ChartPie,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  'circle': Circle,
  'circle-check': CircleCheck,
  'circle-ellipsis': CircleEllipsis,
  'circle-help': CircleHelp,
  'circle-plus': CirclePlus,
  'cloud-off': CloudOff,
  'credit-card': CreditCard,
  'download': Download,
  'file-minus': FileMinus,
  'gift': Gift,
  'graduation-cap': GraduationCap,
  'hand-coins': HandCoins,
  'heart-handshake': HeartHandshake,
  'heart-pulse': HeartPulse,
  'house': House,
  'landmark': Landmark,
  'laptop': Laptop,
  'lock': Lock,
  'log-out': LogOut,
  'party-popper': PartyPopper,
  'paw-print': PawPrint,
  'piggy-bank': PiggyBank,
  'plus': Plus,
  'popcorn': Popcorn,
  'receipt-text': ReceiptText,
  'search-x': SearchX,
  'settings': Settings,
  'settings-2': Settings2,
  'shopping-bag': ShoppingBag,
  'split': Split,
  'tag': Tag,
  'tags': Tags,
  'trash-2': Trash2,
  'trending-up': TrendingUp,
  'triangle-alert': TriangleAlert,
  'user-plus': UserPlus,
  'utensils': Utensils,
  'wallet': Wallet,
  'wand-sparkles': WandSparkles,
  'x': X,
  'zap': Zap,
  'pencil': Pencil,
  'repeat': Repeat,
  'calendar': Calendar,
  'calendar-days': CalendarDays,
  'grip-vertical': GripVertical,
  'bell': Bell,
  'eye': Eye,
  'filter': Filter,
  'chart-column': ChartColumn,
  'sparkles': Sparkles,
  'users': Users,
  'palette': Palette,
  'trash': Trash,
  'check': Check,
  'arrow-left': ArrowLeft,
};

/** Se usa cuando el nombre guardado no esta en el registro. */
export const ICONO_GENERICO = Circle;
