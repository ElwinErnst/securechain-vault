import { SetMetadata } from '@nestjs/common';

export const API_CLIENT_ALLOWED_KEY = 'api_client_allowed';

export const ApiClientAllowed = () => SetMetadata(API_CLIENT_ALLOWED_KEY, true);
