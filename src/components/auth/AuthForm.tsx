import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp';

const AuthForm = () => {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email) {
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập email",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false, // only admins can create users per FR4
        }
      });

      if (error) {
        throw error;
      }

      setIsOtpSent(true);
      toast({
        title: "Đã gửi mã OTP!",
        description: "Vui lòng kiểm tra email của bạn để lấy mã đăng nhập 8 số.",
      });
    } catch (error: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) {
      toast({
        title: "Lỗi gửi mã",
        description: error.message || "Không thể gửi mã OTP. Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 8) {
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập đủ 8 số OTP",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
      });

      if (error) {
        throw error;
      }
      
      toast({
        title: "Chào mừng trở lại!",
        description: "Đăng nhập thành công.",
      });
    } catch (error: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) {
      toast({
        title: "Lỗi xác thực",
        description: "Mã OTP không đúng hoặc đã hết hạn. Thử lại.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto shadow-md">
      <CardHeader>
        <CardTitle>Đăng nhập</CardTitle>
        <CardDescription>
          {!isOtpSent 
            ? 'Nhập email của bạn để nhận mã đăng nhập một lần (OTP)' 
            : `Mã 8 số đã được gửi đến ${email}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!isOtpSent ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email công ty</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="nhanvien@company.com"
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Đang gửi mã...' : 'Gửi mã OTP'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-6">
            <div className="space-y-3 flex flex-col items-center justify-center">
              <Label htmlFor="otp">Mã xác thực 8 số</Label>
              <InputOTP
                id="otp"
                maxLength={8}
                value={otp}
                onChange={(value) => setOtp(value)}
                disabled={loading}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup>
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                  <InputOTPSlot index={6} />
                  <InputOTPSlot index={7} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <div className="space-y-3">
              <Button type="submit" className="w-full" disabled={loading || otp.length !== 8}>
                {loading ? 'Đang xác thực...' : 'Xác nhận & Đăng nhập'}
              </Button>
              <Button 
                type="button" 
                variant="ghost" 
                className="w-full text-muted-foreground text-sm hover:text-foreground"
                onClick={() => handleSendOtp()}
                disabled={loading}
              >
                Chưa nhận được mã? Gửi lại
              </Button>
              <Button 
                type="button" 
                variant="link" 
                className="w-full text-muted-foreground text-sm"
                onClick={() => {
                  setIsOtpSent(false);
                  setOtp('');
                }}
                disabled={loading}
              >
                Sử dụng email khác
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
};

export default AuthForm;
