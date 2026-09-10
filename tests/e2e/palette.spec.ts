import { expect, test } from '@playwright/test';

function luminance(color: string) {
  const rgb = color.match(/[\d.]+/g)!.slice(0,3).map(Number).map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
  return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
}
function contrast(a:string,b:string) {
  const x=luminance(a),y=luminance(b);
  return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
}

test('institutional palette distinguishes actions, surfaces and readable navigation',async({page},testInfo)=>{
  for(const route of ['/protocolos','/login']) {
    await page.goto(route);
    const primary=page.locator(route==='/login'?'.login-card .primary-button':'.module-heading .v2-button');
    await expect(primary).toBeVisible();
    const normal=await primary.evaluate(el=>({fg:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));
    expect(normal.bg).toBe('rgb(20, 107, 98)');
    expect(contrast(normal.fg,normal.bg)).toBeGreaterThanOrEqual(4.5);
    await primary.hover();
    const hover=await primary.evaluate(el=>({fg:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));
    expect(hover.bg).toBe('rgb(15, 84, 77)');
    expect(contrast(hover.fg,hover.bg)).toBeGreaterThanOrEqual(4.5);
    const field=page.locator(route==='/login'?'.login-input':'.v2-toolbar input').first();
    const border=await field.evaluate(el=>({border:getComputedStyle(el).borderTopColor,bg:getComputedStyle(el).backgroundColor}));
    expect(contrast(border.border,border.bg)).toBeGreaterThanOrEqual(3);
    if(testInfo.project.name==='desktop-chromium') {
      const panel=page.locator(route==='/login'?'.login-story':'.v2-sidebar');
      const colors=await panel.evaluate(el=>({fg:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));
      expect(colors.bg).toBe('rgb(19, 61, 58)');
      expect(contrast(colors.fg,colors.bg)).toBeGreaterThanOrEqual(4.5);
      const supportingText=panel.locator(route==='/login'?'.eyebrow':'.v2-nav-caption');
      const foreground=await supportingText.evaluate(el=>getComputedStyle(el).color);
      expect(contrast(foreground,colors.bg)).toBeGreaterThanOrEqual(4.5);
      if(route==='/protocolos') {
        const active=panel.locator('[aria-current="page"]');
        const selection=await active.evaluate(el=>({fg:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));
        expect(contrast(selection.fg,selection.bg)).toBeGreaterThanOrEqual(4.5);
        await active.focus();
        const focus=await active.evaluate(el=>getComputedStyle(el).outlineColor);
        expect(contrast(focus,colors.bg)).toBeGreaterThanOrEqual(3);
      }
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(route==='/login'?'palette-login.png':'palette-protocols.png'),fullPage:true});
  }
});

test('palette remains coherent on dashboard, administration, dialogs and narrow login',async({page},testInfo)=>{
  for(const route of ['/','/administracao','/conhecimento','/melhoria','/reunioes']) {
    await page.goto(route);
    await expect(page.locator('.v2-shell')).toBeVisible();
    expect(await page.locator('.v2-shell').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(244, 247, 246)');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(route==='/') {
      const borders=await page.locator('.metric').evaluateAll(els=>els.map(el=>getComputedStyle(el).borderTopColor));
      expect(borders.length).toBeGreaterThan(0);
      expect(new Set(borders).size).toBe(1);
    }
    if(route==='/administracao') {
      await page.screenshot({path:testInfo.outputPath('palette-administration.png'),fullPage:true});
      await page.getByRole('button',{name:/Abrir conta de/}).click();
      const dialog=page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate(el=>getComputedStyle(el).getPropertyValue('--v2-brand').trim())).toBe('#146b62');
      await page.getByRole('button',{name:'Fechar conta'}).click();
    }
  }
  await page.setViewportSize({width:320,height:740});
  await page.goto('/login');
  await page.getByLabel('E-mail',{exact:true}).focus();
  const input=page.locator('.login-input').first();
  const focus=await input.evaluate(el=>({border:getComputedStyle(el).borderTopColor,bg:getComputedStyle(el).backgroundColor}));
  expect(contrast(focus.border,focus.bg)).toBeGreaterThanOrEqual(3);
  await page.getByRole('button',{name:'Esqueci minha senha'}).click();
  const error=page.locator('.login-card').getByRole('alert');
  await expect(error).toBeVisible();
  const colors=await error.evaluate(el=>({fg:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));
  expect(contrast(colors.fg,colors.bg)).toBeGreaterThanOrEqual(4.5);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('palette-login-320.png'),fullPage:true});
});
