import com.android.apksig.ApkVerifier;
import java.io.File;

public final class VerifyV4Signature {
    private VerifyV4Signature() {}

    public static void main(String[] args) throws Exception {
        if (args.length != 2) {
            System.err.println("Usage: VerifyV4Signature <apk> <apk.idsig>");
            System.exit(2);
        }

        ApkVerifier.Result result = new ApkVerifier.Builder(new File(args[0]))
                .setV4SignatureFile(new File(args[1]))
                .setMinCheckedPlatformVersion(30)
                .build()
                .verify();

        System.out.println("Overall verified: " + result.isVerified());
        System.out.println("Verified using v4 scheme: " + result.isVerifiedUsingV4Scheme());

        if (!result.isVerified() || !result.isVerifiedUsingV4Scheme()) {
            for (ApkVerifier.IssueWithParams error : result.getAllErrors()) {
                System.err.println("ERROR: " + error);
            }
            System.exit(1);
        }
    }
}
