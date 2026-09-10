"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, Mail, Stethoscope } from "lucide-react";
import { createSupabaseBrowserClient, createSupabaseRecoveryClient } from "@/lib/client/supabase";
import { readAuthCallback } from "@/lib/client/auth-callback";

function authMessage(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code === "invalid_credentials") return "E-mail ou senha incorretos. Confira os dados e tente novamente.";
  if (code === "email_not_confirmed") return "Confirme seu e-mail pelo convite recebido antes de entrar.";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
  if (code === "same_password") return "Escolha uma senha diferente da senha atual.";
  if (code === "weak_password") return "Escolha uma senha mais forte, com letras, números e símbolos.";
  if (code === "otp_expired" || code === "session_not_found") return "Este link não é mais válido. Solicite uma nova recuperação de senha.";
  return "Não foi possível concluir. Verifique sua conexão e tente novamente.";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [loading, setLoading] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const useImplicitRecovery = useRef(false);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    const callback = readAuthCallback(window.location.href);
    useImplicitRecovery.current = callback.mode !== null && window.location.hash.includes("access_token=");
    const client = useImplicitRecovery.current ? createSupabaseRecoveryClient() : createSupabaseBrowserClient();
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (callback.error) setMessage(callback.error);
      if (callback.mode) {
        setRecovery(true);
        setLoading(true);
      }
    });
    if (callback.mode) {
      void client.auth.getSession().then(({ data: { session } }) => {
        if (!active) return;
        if (!session) setMessage("Não foi possível validar este link. Solicite uma nova recuperação de senha.");
        setLoading(false);
      });
    }
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || (callback.mode === "invite" && event === "SIGNED_IN")) {
        setRecovery(true);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setMessageTone("error");
    try {
      const client = createSupabaseBrowserClient();
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const returnTo = new URLSearchParams(window.location.search).get("returnTo");
      router.replace(returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/");
      router.refresh();
    } catch (error) {
      setMessage(authMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    setMessageTone("error");
    if (!email) return setMessage("Informe seu e-mail para recuperar o acesso.");
    setLoading(true);
    setMessage(null);
    try {
      const client = createSupabaseRecoveryClient();
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login` });
      if (error) throw error;
      setMessageTone("success");
      setMessage("Se este e-mail tiver acesso, você receberá as instruções de recuperação. Confira também a caixa de spam.");
    } catch (error) {
      setMessage(authMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function updatePassword(event: React.FormEvent) {
    event.preventDefault(); setMessage(null); setMessageTone("error");
    if(newPassword!==confirmPassword){setMessage("As senhas não coincidem. Digite novamente.");return;}
    setLoading(true);
    try {
      const client=useImplicitRecovery.current ? createSupabaseRecoveryClient() : createSupabaseBrowserClient();
      const {data:{user}}=await client.auth.getUser();
      const {error}=await client.auth.updateUser({password:newPassword});
      if(error)throw error;
      if(useImplicitRecovery.current&&user?.email){
        await client.auth.signOut();
        const {error:signInError}=await createSupabaseBrowserClient().auth.signInWithPassword({email:user.email,password:newPassword});
        if(signInError)throw signInError;
      }
      setMessageTone("success"); setMessage("Senha atualizada. Você já pode continuar."); setRecovery(false); router.replace("/"); router.refresh();
    }
    catch(error){setMessage(authMessage(error));} finally{setLoading(false);}
  }

  return <main className="ux-v2 login-page v2-login">
    <section className="login-story">
      <div className="login-brand"><span className="brand-mark"><Stethoscope size={23} /></span><span><b>SGC UBS</b><small>Gestão integrada</small></span></div>
      <div><span className="eyebrow">Conhecimento que vira ação</span><h1>Gerencie a unidade com clareza, evidência e continuidade.</h1><p>Protocolos vivos, indicadores governados e melhoria contínua em um único lugar.</p></div>
      <div className="login-principles"><span><LockKeyhole size={15} /> Dados segregados por UBS</span><span><KeyRound size={15} /> Acesso somente por convite</span></div>
    </section>
    <section className="login-form-wrap">
      <form className="login-card" aria-busy={loading} onSubmit={recovery ? updatePassword : signIn}>
        <div><span className="eyebrow">Acesso institucional</span><h2>{recovery ? "Defina sua nova senha" : "Bem-vindo de volta"}</h2><p>{recovery ? "Crie uma senha exclusiva com pelo menos 10 caracteres." : "Entre com o e-mail que recebeu o convite."}</p></div>
        {!recovery && <label>E-mail<div className="login-input"><Mail size={16} /><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@municipio.gov.br" /></div></label>}
        <div className="login-field"><label htmlFor="login-password">{recovery ? "Nova senha" : "Senha"}</label><div className="login-input"><KeyRound size={16} aria-hidden /><input id="login-password" type={showNewPassword ? "text" : "password"} required minLength={recovery ? 10 : undefined} autoComplete={recovery ? "new-password" : "current-password"} value={recovery ? newPassword : password} onChange={(event) => recovery ? setNewPassword(event.target.value) : setPassword(event.target.value)} placeholder={recovery ? "Mínimo de 10 caracteres" : "Sua senha"} /><button type="button" className="password-visibility" onClick={()=>setShowNewPassword((visible)=>!visible)} aria-label={showNewPassword ? "Ocultar senhas" : "Mostrar senhas"} aria-pressed={showNewPassword}>{showNewPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></div>
        {recovery&&<label>Repita a nova senha<div className="login-input"><KeyRound size={16}/><input type={showNewPassword ? "text" : "password"} required minLength={10} autoComplete="new-password" value={confirmPassword} onChange={(event)=>setConfirmPassword(event.target.value)} placeholder="Digite a mesma senha novamente"/></div></label>}
        {message && <div className="v2-alert" data-tone={messageTone} role={messageTone === "error" ? "alert" : "status"}>{message}</div>}
        <button className="primary-button login-submit" disabled={loading}>{loading ? "Processando..." : recovery ? "Definir nova senha" : "Entrar"}<ArrowRight size={16} /></button>
        {!recovery && <button type="button" className="link-button" onClick={resetPassword} disabled={loading}>Esqueci minha senha</button>}
        <small>Não existe cadastro público. Solicite acesso ao administrador da sua organização.</small>
      </form>
    </section>
  </main>;
}
