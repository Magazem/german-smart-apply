import { Equals, IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Password must include at least one uppercase letter, one lowercase letter, and one number',
  })
  password!: string;

  // Must be explicitly true - registration is rejected otherwise. Not "consent"
  // in the GDPR sense (this is contract-necessity, Art 6(1)(b)), but gated the
  // same way so a user can never end up with an account with no record of
  // having agreed to the Terms of Service and Privacy Policy.
  @Equals(true, { message: 'You must agree to the Terms of Service and Privacy Policy to create an account' })
  acceptedTerms!: boolean;

  @IsString()
  acceptedPolicyVersion!: string;
}
