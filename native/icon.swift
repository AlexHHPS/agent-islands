import Cocoa
let size = 1024
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()
func color(_ hex: UInt32) -> NSColor { NSColor(srgbRed: CGFloat((hex >> 16) & 255)/255, green: CGFloat((hex >> 8) & 255)/255, blue: CGFloat(hex & 255)/255, alpha: 1) }
func poly(_ points: [(CGFloat,CGFloat)], _ c: UInt32) { color(c).setFill(); let p = NSBezierPath(); p.move(to: NSPoint(x: points[0].0,y:points[0].1)); for q in points.dropFirst() { p.line(to:NSPoint(x:q.0,y:q.1)) };p.close();p.fill() }
func ellipse(_ rect: NSRect, _ c: UInt32){color(c).setFill();NSBezierPath(ovalIn:rect).fill()}
color(0xf5f1e6).setFill();NSBezierPath(roundedRect:NSRect(x:25,y:25,width:974,height:974),xRadius:210,yRadius:210).fill()
ellipse(NSRect(x:180,y:160,width:680,height:180),0xe5e2d4)
poly([(130,420),(490,630),(900,420),(900,300),(540,105),(130,300)],0x9ca480)
poly([(130,420),(490,630),(900,420),(540,210)],0xc8d2af)
poly([(280,470),(480,580),(700,465),(500,350)],0xf8f5e8)
poly([(280,470),(500,350),(500,570),(280,690)],0xe3ddc7)
poly([(500,350),(700,465),(700,680),(500,570)],0xfaf6e6)
poly([(240,680),(480,835),(735,690),(500,550)],0xbe8264)
poly([(500,550),(735,690),(735,645),(500,505)],0x9e684f)
poly([(560,395),(620,430),(620,545),(560,510)],0x527363)
poly([(315,500),(390,458),(390,550),(315,592)],0x729394)
poly([(645,560),(695,588),(695,640),(645,612)],0x729394)
poly([(725,380),(745,390),(745,570),(725,560)],0x89735d)
ellipse(NSRect(x:666,y:520,width:144,height:164),0x78946d)
ellipse(NSRect(x:705,y:583,width:114,height:134),0x9bad80)
ellipse(NSRect(x:650,y:575,width:100,height:115),0x8fa878)
// Little agent on the courtyard: ivory head, forest jacket, dark visor.
color(0x527363).setFill();NSBezierPath(roundedRect:NSRect(x:387,y:260,width:65,height:70),xRadius:14,yRadius:14).fill()
color(0xfaf8ed).setFill();NSBezierPath(roundedRect:NSRect(x:374,y:320,width:91,height:66),xRadius:18,yRadius:18).fill()
color(0x33463c).setFill();NSBezierPath(roundedRect:NSRect(x:386,y:337,width:67,height:27),xRadius:9,yRadius:9).fill()
ellipse(NSRect(x:398,y:346,width:8,height:8),0xc2dacb);ellipse(NSRect(x:432,y:346,width:8,height:8),0xc2dacb)
image.unlockFocus()
let rep = NSBitmapImageRep(data:image.tiffRepresentation!)!
try rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:CommandLine.arguments[1]))
