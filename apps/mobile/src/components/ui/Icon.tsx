import Svg, { Path, Circle, Rect, Ellipse } from "react-native-svg";

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 18, color = "#e6eee9", strokeWidth = 1.7 }: IconProps) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "home":
      return <Svg {...props}><Path d="M3 12l9-9 9 9" /><Path d="M5 10v10h14V10" /></Svg>;
    case "folder":
      return <Svg {...props}><Path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Svg>;
    case "key":
      return <Svg {...props}><Circle cx={8} cy={15} r={4} /><Path d="M11 12l8-8m-3 0h3v3" /></Svg>;
    case "users":
      return <Svg {...props}><Circle cx={9} cy={8} r={3} /><Path d="M3 20a6 6 0 0 1 12 0" /><Circle cx={17} cy={9} r={2.5} /><Path d="M17 14a4 4 0 0 1 4 4" /></Svg>;
    case "bell":
      return <Svg {...props}><Path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><Path d="M10 20a2 2 0 0 0 4 0" /></Svg>;
    case "shield":
      return <Svg {...props}><Path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></Svg>;
    case "eye":
      return <Svg {...props}><Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><Circle cx={12} cy={12} r={3} /></Svg>;
    case "eye-off":
      return <Svg {...props}><Path d="M3 3l18 18" /><Path d="M10.5 6.2A10 10 0 0 1 22 12s-1.4 2.7-4 4.6" /><Path d="M6.6 6.6C3.6 8.3 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1" /><Path d="M9.5 9.5a3 3 0 0 0 4.2 4.2" /></Svg>;
    case "copy":
      return <Svg {...props}><Rect x={9} y={9} width={11} height={11} rx={2} /><Path d="M5 15V5a2 2 0 0 1 2-2h10" /></Svg>;
    case "share":
      return <Svg {...props}><Circle cx={6} cy={12} r={2.5} /><Circle cx={18} cy={6} r={2.5} /><Circle cx={18} cy={18} r={2.5} /><Path d="M8 11l8-4M8 13l8 4" /></Svg>;
    case "plus":
      return <Svg {...props}><Path d="M12 5v14M5 12h14" /></Svg>;
    case "search":
      return <Svg {...props}><Circle cx={11} cy={11} r={7} /><Path d="M20 20l-4-4" /></Svg>;
    case "face-id":
      return <Svg {...props}><Path d="M5 9V7a2 2 0 0 1 2-2h2" /><Path d="M19 9V7a2 2 0 0 0-2-2h-2" /><Path d="M5 15v2a2 2 0 0 0 2 2h2" /><Path d="M19 15v2a2 2 0 0 1-2 2h-2" /><Path d="M9 10v2" /><Path d="M15 10v2" /><Path d="M12 9v4l-1 1" /><Path d="M9 16s1 1 3 1 3-1 3-1" /></Svg>;
    case "fingerprint":
      return <Svg {...props}><Path d="M12 11v3a4 4 0 0 1-1 3" /><Path d="M16 11a4 4 0 0 0-8 0v3" /><Path d="M19 11a7 7 0 0 0-13.5-2.6" /><Path d="M5 14v1a8 8 0 0 0 1 4" /><Path d="M14 17.5l-1 3.5" /></Svg>;
    case "arrow-r":
      return <Svg {...props}><Path d="M5 12h14M13 6l6 6-6 6" /></Svg>;
    case "arrow-l":
      return <Svg {...props}><Path d="M19 12H5M11 6l-6 6 6 6" /></Svg>;
    case "check":
      return <Svg {...props}><Path d="M5 12l5 5L20 7" /></Svg>;
    case "x":
      return <Svg {...props}><Path d="M6 6l12 12M18 6L6 18" /></Svg>;
    case "cog":
      return <Svg {...props}><Circle cx={12} cy={12} r={3} /><Path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4.9a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.5a7 7 0 0 0-2 1.2l-2.4-.9-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-.9a7 7 0 0 0 2 1.2L10 21h4l.5-2.5a7 7 0 0 0 2-1.2l2.4.9 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" /></Svg>;
    case "chev-r":
      return <Svg {...props}><Path d="M9 6l6 6-6 6" /></Svg>;
    case "chev-d":
      return <Svg {...props}><Path d="M6 9l6 6 6-6" /></Svg>;
    case "pulse":
      return <Svg {...props}><Path d="M3 12h4l2-7 4 14 2-7h6" /></Svg>;
    case "flame":
      return <Svg {...props}><Path d="M12 2c1 5 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4-1 3 1 4 1 4 0-3 2-5 2-11z" /></Svg>;
    case "star":
      return <Svg {...props}><Path d="M12 2l3 7 7 .8-5 5 1.5 7L12 18l-6.5 3.8L7 14l-5-5 7-.8z" /></Svg>;
    case "globe":
      return <Svg {...props}><Circle cx={12} cy={12} r={9} /><Path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></Svg>;
    case "lock":
      return <Svg {...props}><Rect x={5} y={11} width={14} height={10} rx={2} /><Path d="M8 11V7a4 4 0 0 1 8 0v4" /></Svg>;
    case "unlock":
      return <Svg {...props}><Rect x={5} y={11} width={14} height={10} rx={2} /><Path d="M8 11V7a4 4 0 0 1 7-2" /></Svg>;
    case "clock":
      return <Svg {...props}><Circle cx={12} cy={12} r={9} /><Path d="M12 7v5l3 2" /></Svg>;
    case "send":
      return <Svg {...props}><Path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></Svg>;
    case "github":
      return <Svg {...props}><Path d="M12 2a10 10 0 0 0-3 19.5c.5 0 .7-.2.7-.5v-2c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-1-.6 0-.6 0-.6 1 0 1.6 1 1.6 1 1 1.6 2.5 1.2 3 .9.1-.7.4-1.2.7-1.5-2.2-.2-4.6-1.1-4.6-5 0-1 .4-1.9 1-2.5-.1-.3-.5-1.3.1-2.7 0 0 .9-.3 2.8 1a10 10 0 0 1 5 0c2-1.3 2.8-1 2.8-1 .6 1.4.2 2.4.1 2.7.6.6 1 1.5 1 2.5 0 3.9-2.4 4.8-4.6 5 .4.3.7.9.7 1.9v2.7c0 .3.2.6.7.5A10 10 0 0 0 12 2z" /></Svg>;
    case "rocket":
      return <Svg {...props}><Path d="M5 13c0-5 7-11 12-11 0 5-6 12-11 12-1 0-1-1-1-1zM5 13l-3 3 3 1 1 3 3-3" /><Circle cx={14} cy={9} r={1.5} /></Svg>;
    case "database":
      return <Svg {...props}><Ellipse cx={12} cy={5} rx={8} ry={3} /><Path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></Svg>;
    case "box":
      return <Svg {...props}><Path d="M21 8L12 3 3 8v8l9 5 9-5z" /><Path d="M3 8l9 5 9-5M12 13v8" /></Svg>;
    case "logo":
      return <Svg {...props}><Path d="M4 6l4 4-4 4M10 16h10" /></Svg>;
    default:
      return <Svg {...props}><Circle cx={12} cy={12} r={8} /></Svg>;
  }
}
