import navHome from '../assets/icons/nav-home.svg';
import navProposals from '../assets/icons/nav-proposals.svg';
import navKnowledge from '../assets/icons/nav-knowledge.svg';
import navRateCard from '../assets/icons/nav-rate-card.svg';
import navSettings from '../assets/icons/nav-settings.svg';
import search from '../assets/icons/search.svg';
import chevronSm from '../assets/icons/chevron-sm.svg';
import chevronField from '../assets/icons/chevron-field.svg';
import chevronCard from '../assets/icons/chevron-card.svg';
import alert from '../assets/icons/alert.svg';
import file16 from '../assets/icons/file-16.svg';
import file18 from '../assets/icons/file-18.svg';
import file20 from '../assets/icons/file-20.svg';
import more from '../assets/icons/more.svg';
import upload from '../assets/icons/upload.svg';
import x from '../assets/icons/x.svg';
import sparkle from '../assets/icons/sparkle.svg';
import check from '../assets/icons/check.svg';
import message from '../assets/icons/message.svg';

// Icons exported from the Figma file. Each SVG carries its own width/height.
export const icons = {
  navHome,
  navProposals,
  navKnowledge,
  navRateCard,
  navSettings,
  search,
  chevronSm,
  chevronField,
  chevronCard,
  alert,
  file16,
  file18,
  file20,
  more,
  upload,
  x,
  sparkle,
  check,
  message,
};

export function Icon({ src, size, className }: { src: string; size: number; className?: string }) {
  return <img src={src} width={size} height={size} alt="" className={className} draggable={false} />;
}
