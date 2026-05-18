CREATE POLICY "Users can delete own notifications"
ON public.notifications
FOR DELETE
TO public
USING (auth.uid() = user_id);