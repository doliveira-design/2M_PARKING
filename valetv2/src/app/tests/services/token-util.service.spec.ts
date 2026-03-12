import { TestBed, inject } from '@angular/core/testing';

import { TokenUtilService } from '../../services/token-util.service';

describe('TokenUtilService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TokenUtilService]
    });
  });

  it('should be created', inject([TokenUtilService], (service: TokenUtilService) => {
    expect(service).toBeTruthy();
  }));
});
